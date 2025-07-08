import { Socket } from 'net';
import * as fs from 'fs';
import * as path from 'path';

export class CustomFtpClient {
    private readonly controlSocket: Socket;
    private dataSocket: Socket | null = null;
    private readonly host: string;
    private readonly port: number;
    private controlSocketBuffer: string = '';

    constructor(host: string, port = 21) {
        this.host = host;
        this.port = port;
        this.controlSocket = new Socket();
    }

    private readControlResponse(): Promise<string> {
        return new Promise((resolve, reject) => {
            let timeoutId: NodeJS.Timeout;

            const processBuffer = () => {
                const lines = this.controlSocketBuffer.split(/\r\n|\n/);
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i];
                    if (/^\d{3} /.test(line)) {
                        const responseEndIndex = this.controlSocketBuffer.indexOf(line) + line.length;
                        const response = this.controlSocketBuffer.substring(0, responseEndIndex);
                        this.controlSocketBuffer = this.controlSocketBuffer.substring(responseEndIndex).trim();
                        cleanup();
                        resolve(response.trim());
                        return true;
                    }
                }
                return false;
            };

            const onData = (data: Buffer) => {
                this.controlSocketBuffer += data.toString('utf-8');
                processBuffer();
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const onTimeout = () => {
                cleanup();
                reject(new Error(`FTP response timeout. Buffer: "${this.controlSocketBuffer}"`));
            };

            const cleanup = () => {
                this.controlSocket.removeListener('data', onData);
                this.controlSocket.removeListener('error', onError);
                clearTimeout(timeoutId);
            };

            if (processBuffer()) {
                return;
            }

            timeoutId = setTimeout(onTimeout, 30000);
            this.controlSocket.on('data', onData);
            this.controlSocket.once('error', onError);
        });
    }

    private async sendCommand(command: string): Promise<string> {
        const responsePromise = this.readControlResponse();
        this.controlSocket.write(`${command}\r\n`);
        return responsePromise;
    }

    async connect(user: string, pass: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const onConnect = async () => {
                try {
                    this.controlSocket.removeListener('error', onError);
                    const welcomeMessage = await this.readControlResponse();
                    if (!welcomeMessage.startsWith('220')) {
                        return reject(new Error(`Unexpected FTP welcome message: ${welcomeMessage}`));
                    }

                    const userResponse = await this.sendCommand(`USER ${user}`);
                    if (!userResponse.startsWith('331')) {
                        return reject(new Error(`FTP user command failed: ${userResponse}`));
                    }

                    const passResponse = await this.sendCommand(`PASS ${pass}`);
                    if (!passResponse.startsWith('230')) {
                        return reject(new Error(`FTP pass command failed: ${passResponse}`));
                    }
                    resolve();
                } catch (err) {
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            };

            const onError = (err: Error) => {
                this.controlSocket.removeListener('connect', onConnect);
                reject(err);
            };

            this.controlSocket.once('connect', onConnect);
            this.controlSocket.once('error', onError);
            this.controlSocket.connect(this.port, this.host);
        });
    }

    async enterPassiveMode(): Promise<{ host: string; port: number }> {
        const response = await this.sendCommand('PASV');
        const match = response.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
        if (!match) {
            throw new Error(`Invalid PASV response: ${response}`);
        }
        const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
        const port = (parseInt(match[5]) << 8) + parseInt(match[6]);
        return { host, port };
    }

    async upload(localPath: string, remotePath: string): Promise<void> {
        const { host, port } = await this.enterPassiveMode();

        const dataSocket = new Socket();
        this.dataSocket = dataSocket;

        const connectPromise = new Promise<void>((resolve, reject) => {
            const onError = (err: Error) => {
                dataSocket.removeListener('connect', onConnect);
                reject(err);
            };
            const onConnect = () => {
                dataSocket.removeListener('error', onError);
                resolve();
            };
            dataSocket.once('connect', onConnect);
            dataSocket.once('error', onError);
            dataSocket.connect(port, host);
        });

        await connectPromise;

        const storResponse = await this.sendCommand(`STOR ${remotePath}`);
        if (!storResponse.startsWith('150') && !storResponse.startsWith('125')) {
            dataSocket.destroy();
            throw new Error(`FTP STOR command failed: ${storResponse}`);
        }

        const transferPromise = new Promise<void>((resolve, reject) => {
            const readStream = fs.createReadStream(localPath);
            readStream.on('error', reject);
            dataSocket.on('error', reject);
            dataSocket.on('close', resolve);
            readStream.pipe(dataSocket);
        });

        const responsePromise = this.readControlResponse();

        const [, finalResponse] = await Promise.all([transferPromise, responsePromise]);

        if (!finalResponse.startsWith('226') && !finalResponse.startsWith('250')) {
            throw new Error(`Unexpected response after upload: ${finalResponse}`);
        }
    }

    async ensureDir(remotePath: string): Promise<void> {
        const parts = remotePath.split('/').filter(p => p);
        let path_to_create = remotePath.startsWith('/') ? '/' : '';

        for (const part of parts) {
            path_to_create = path.posix.join(path_to_create, part);
            const mkdResponse = await this.sendCommand(`MKD ${path_to_create}`);
            if (!mkdResponse.startsWith('257') && !mkdResponse.startsWith('550')) {
                throw new Error(`Failed to create directory ${path_to_create}: ${mkdResponse}`);
            }
        }
    }

    async uploadFromDir(localDir: string, remoteDir: string): Promise<void> {
        const files = fs.readdirSync(localDir);
        for (const file of files) {
            const localPath = path.join(localDir, file);
            const remotePath = path.join(remoteDir, file);
            if (fs.statSync(localPath).isDirectory()) {
                console.log(`Creating directory: ${remotePath}`)
                await this.ensureDir(remotePath);
                await this.uploadFromDir(localPath, remotePath);
            } else {
                console.log(`Uploading file: ${localPath} to ${remotePath}`);
                await this.upload(localPath, remotePath);
            }
        }
    }

    close(): void {
        this.controlSocket.end();
        if (this.dataSocket) {
            this.dataSocket.end();
        }
    }
}