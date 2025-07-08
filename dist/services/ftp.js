"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomFtpClient = void 0;
const net_1 = require("net");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class CustomFtpClient {
    constructor(host, port = 21) {
        this.dataSocket = null;
        this.controlSocketBuffer = '';
        this.host = host;
        this.port = port;
        this.controlSocket = new net_1.Socket();
    }
    readControlResponse() {
        return new Promise((resolve, reject) => {
            let timeoutId;
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
            const onData = (data) => {
                this.controlSocketBuffer += data.toString('utf-8');
                processBuffer();
            };
            const onError = (err) => {
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
    sendCommand(command) {
        return __awaiter(this, void 0, void 0, function* () {
            const responsePromise = this.readControlResponse();
            this.controlSocket.write(`${command}\r\n`);
            return responsePromise;
        });
    }
    connect(user, pass) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const onConnect = () => __awaiter(this, void 0, void 0, function* () {
                    try {
                        this.controlSocket.removeListener('error', onError);
                        const welcomeMessage = yield this.readControlResponse();
                        if (!welcomeMessage.startsWith('220')) {
                            return reject(new Error(`Unexpected FTP welcome message: ${welcomeMessage}`));
                        }
                        const userResponse = yield this.sendCommand(`USER ${user}`);
                        if (!userResponse.startsWith('331')) {
                            return reject(new Error(`FTP user command failed: ${userResponse}`));
                        }
                        const passResponse = yield this.sendCommand(`PASS ${pass}`);
                        if (!passResponse.startsWith('230')) {
                            return reject(new Error(`FTP pass command failed: ${passResponse}`));
                        }
                        resolve();
                    }
                    catch (err) {
                        reject(err instanceof Error ? err : new Error(String(err)));
                    }
                });
                const onError = (err) => {
                    this.controlSocket.removeListener('connect', onConnect);
                    reject(err);
                };
                this.controlSocket.once('connect', onConnect);
                this.controlSocket.once('error', onError);
                this.controlSocket.connect(this.port, this.host);
            });
        });
    }
    enterPassiveMode() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendCommand('PASV');
            const match = response.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
            if (!match) {
                throw new Error(`Invalid PASV response: ${response}`);
            }
            const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
            const port = (parseInt(match[5]) << 8) + parseInt(match[6]);
            return { host, port };
        });
    }
    upload(localPath, remotePath) {
        return __awaiter(this, void 0, void 0, function* () {
            const { host, port } = yield this.enterPassiveMode();
            const dataSocket = new net_1.Socket();
            this.dataSocket = dataSocket;
            const connectPromise = new Promise((resolve, reject) => {
                const onError = (err) => {
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
            yield connectPromise;
            const storResponse = yield this.sendCommand(`STOR ${remotePath}`);
            if (!storResponse.startsWith('150') && !storResponse.startsWith('125')) {
                dataSocket.destroy();
                throw new Error(`FTP STOR command failed: ${storResponse}`);
            }
            const transferPromise = new Promise((resolve, reject) => {
                const readStream = fs.createReadStream(localPath);
                readStream.on('error', reject);
                dataSocket.on('error', reject);
                dataSocket.on('close', resolve);
                readStream.pipe(dataSocket);
            });
            const responsePromise = this.readControlResponse();
            const [, finalResponse] = yield Promise.all([transferPromise, responsePromise]);
            if (!finalResponse.startsWith('226') && !finalResponse.startsWith('250')) {
                throw new Error(`Unexpected response after upload: ${finalResponse}`);
            }
        });
    }
    ensureDir(remotePath) {
        return __awaiter(this, void 0, void 0, function* () {
            const parts = remotePath.split('/').filter(p => p);
            let path_to_create = remotePath.startsWith('/') ? '/' : '';
            for (const part of parts) {
                path_to_create = path.posix.join(path_to_create, part);
                const mkdResponse = yield this.sendCommand(`MKD ${path_to_create}`);
                if (!mkdResponse.startsWith('257') && !mkdResponse.startsWith('550')) {
                    throw new Error(`Failed to create directory ${path_to_create}: ${mkdResponse}`);
                }
            }
        });
    }
    uploadFromDir(localDir, remoteDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const files = fs.readdirSync(localDir);
            for (const file of files) {
                const localPath = path.join(localDir, file);
                const remotePath = path.join(remoteDir, file);
                if (fs.statSync(localPath).isDirectory()) {
                    console.log(`Creating directory: ${remotePath}`);
                    yield this.ensureDir(remotePath);
                    yield this.uploadFromDir(localPath, remotePath);
                }
                else {
                    console.log(`Uploading file: ${localPath} to ${remotePath}`);
                    yield this.upload(localPath, remotePath);
                }
            }
        });
    }
    close() {
        this.controlSocket.end();
        if (this.dataSocket) {
            this.dataSocket.end();
        }
    }
}
exports.CustomFtpClient = CustomFtpClient;
