import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SyncState, saveState } from './state';
import { ByteProgress, logByteProgress } from './progress';

const toPosix = (value: string): string => value.split(path.sep).join(path.posix.sep);

const expandHome = (input: string): string => {
    if (!input.startsWith('~')) {
        return input;
    }
    const trimmed = input.slice(1);
    const home = os.homedir();
    return path.join(home, trimmed);
};

const escapeDoubleQuotes = (value: string): string => value.replace(/(["\\$`])/g, '\\$1');

const getTotalBytes = (filePaths: string[]): number => filePaths.reduce((total, filePath) => {
    return total + fs.statSync(filePath).size;
}, 0);

const getTarArchiveSize = (sourceDir: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        const tarProcess = spawn('tar', ['-czf', '-', '-C', sourceDir, '.']);
        let totalBytes = 0;
        let stderrBuffer = '';

        tarProcess.stdout?.on('data', (chunk) => {
            totalBytes += chunk.length;
        });
        tarProcess.stderr?.on('data', (data) => {
            stderrBuffer += data.toString();
        });
        tarProcess.on('error', (error) => reject(error));
        tarProcess.on('close', (code) => {
            if (code === 0) {
                resolve(totalBytes);
                return;
            }
            reject(new Error(stderrBuffer.trim() || `tar exited with code ${code}`));
        });
    });
};

export interface SshCredentials {
    host: string;
    username: string;
    privateKey?: string;
    password?: string;
}

const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []): string[] => {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const absolute = path.join(dirPath, file);
        if (fs.statSync(absolute).isDirectory()) {
            getAllFiles(absolute, arrayOfFiles);
        } else {
            arrayOfFiles.push(absolute);
        }
    }
    return arrayOfFiles;
};

const resolveSshCredentials = (base: SshCredentials, overrides?: Partial<SshCredentials>): SshCredentials => ({
    host: overrides?.host ?? base.host,
    username: overrides?.username ?? base.username,
    privateKey: overrides?.privateKey ?? base.privateKey,
    password: overrides?.password ?? base.password,
});

const hasPrivateKey = (credentials: SshCredentials): boolean => {
    return Boolean(credentials.privateKey && credentials.privateKey.trim());
};

const hasPassword = (credentials: SshCredentials): boolean => Boolean(credentials.password);

const ensureSshAuth = (credentials: SshCredentials): void => {
    if (!hasPrivateKey(credentials) && !hasPassword(credentials)) {
        throw new Error('SSH authentication is missing.');
    }
};

const buildSshArgs = (credentials: SshCredentials, command: string): string[] => {
    const sshTarget = `${credentials.username}@${credentials.host}`;
    const args: string[] = [];
    if (hasPrivateKey(credentials) && credentials.privateKey) {
        const privateKeyPath = expandHome(credentials.privateKey);
        args.push('-i', privateKeyPath);
    }
    args.push(sshTarget, command);
    return args;
};

const mapSpawnError = (error: NodeJS.ErrnoException, credentials: SshCredentials): Error => {
    if (error.code === 'ENOENT' && hasPassword(credentials) && !hasPrivateKey(credentials)) {
        return new Error('SSH password authentication requires sshpass. Install sshpass or use privateKey.');
    }
    return error;
};

export const createSshProcess = (
    credentials: SshCredentials,
    command: string,
    options: { env?: NodeJS.ProcessEnv } = {},
) => {
    ensureSshAuth(credentials);
    const args = buildSshArgs(credentials, command);
    if (hasPassword(credentials) && !hasPrivateKey(credentials)) {
        return spawn('sshpass', ['-p', credentials.password as string, 'ssh', ...args], {
            env: options.env,
        });
    }
    return spawn('ssh', args, { env: options.env });
};

export interface UploadViaSshOptions {
    sourceDir?: string;
    destinationDir?: string;
    ssh?: Partial<SshCredentials>;
    preserveMode?: boolean;
    uploadStrategy?: 'files' | 'tar';
}

const uploadViaSshTar = async (
    sourceDir: string,
    destinationDir: string,
    credentials: SshCredentials,
    preserveMode: boolean,
    ui: any,
    state: SyncState,
): Promise<void> => {
    const allFiles = getAllFiles(sourceDir);
    let totalBytes = 0;
    try {
        ui.info('Calculating archive size for progress...');
        totalBytes = await getTarArchiveSize(sourceDir);
    } catch (error) {
        ui.warn(`Archive size estimate failed, falling back to file sizes. Error: ${(error as Error).message}`);
        totalBytes = getTotalBytes(allFiles);
    }

    const progress: ByteProgress = {
        totalBytes,
        transferredBytes: 0,
    };

    await new Promise<void>((resolve, reject) => {
        const escapedDest = escapeDoubleQuotes(destinationDir);
        const extractArgs = preserveMode
            ? `tar -xzf - -p -C "${escapedDest}"`
            : `tar -xzf - -C "${escapedDest}"`;
        const remoteCommand = `mkdir -p "${escapedDest}" && ${extractArgs}`;
        const sshProcess = createSshProcess(credentials, remoteCommand);
        const tarProcess = spawn('tar', ['-czf', '-', '-C', sourceDir, '.']);
        let sshStderr = '';
        let tarStderr = '';
        let sshCode: number | null = null;
        let tarCode: number | null = null;

        const finalize = () => {
            if (sshCode === null || tarCode === null) {
                return;
            }
            if (sshCode === 0 && tarCode === 0) {
                progress.transferredBytes = progress.totalBytes;
                logByteProgress(progress, ui);
                state.uploadedFiles = allFiles;
                saveState(state);
                resolve();
                return;
            }
            const details = [
                sshStderr.trim() ? `SSH: ${sshStderr.trim()}` : '',
                tarStderr.trim() ? `tar: ${tarStderr.trim()}` : '',
            ].filter(Boolean).join(' | ');
            reject(new Error(details || `SSH/tar upload failed (ssh=${sshCode}, tar=${tarCode}).`));
        };

        sshProcess.stderr?.on('data', (data) => {
            sshStderr += data.toString();
        });
        tarProcess.stderr?.on('data', (data) => {
            tarStderr += data.toString();
        });

        sshProcess.on('error', (error) => reject(mapSpawnError(error as NodeJS.ErrnoException, credentials)));
        tarProcess.on('error', (error) => {
            sshProcess.kill();
            reject(error);
        });

        tarProcess.stdout?.on('data', (chunk) => {
            progress.transferredBytes += chunk.length;
            logByteProgress(progress, ui);
        });

        if (!sshProcess.stdin || !tarProcess.stdout) {
            tarProcess.kill();
            sshProcess.kill();
            reject(new Error('SSH upload failed to initialize streams.'));
            return;
        }

        sshProcess.stdin.on('error', (error) => {
            tarProcess.kill();
            reject(new Error(`SSH upload failed: ${error.message}`));
        });

        tarProcess.stdout.pipe(sshProcess.stdin);

        tarProcess.on('close', (code) => {
            tarCode = code ?? 1;
            if (sshProcess.stdin) {
                sshProcess.stdin.end();
            }
            finalize();
        });

        sshProcess.on('close', (code) => {
            sshCode = code ?? 1;
            finalize();
        });
    });
};

export const uploadViaSsh = async (
    config: {
        ssh?: SshCredentials;
        final_folder?: string;
        destination_folder?: string;
        sourceDir?: string;
        destinationDir?: string;
        preserveMode?: boolean;
        uploadStrategy?: 'files' | 'tar';
    },
    ui: any,
    state: SyncState,
    options: UploadViaSshOptions = {},
): Promise<void> => {
    const baseCredentials = config.ssh;
    if (!baseCredentials) {
        throw new Error('SSH configuration is missing.');
    }

    const credentials = resolveSshCredentials(baseCredentials, options.ssh);
    ensureSshAuth(credentials);

    const sourceDir = options.sourceDir ?? config.sourceDir ?? config.final_folder;
    const remoteDestinationFolder = toPosix(
        options.destinationDir ?? config.destinationDir ?? config.destination_folder ?? '',
    );

    if (!sourceDir || !remoteDestinationFolder) {
        throw new Error('Invalid run configuration.');
    }

    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error(`Source directory for SSH upload does not exist: ${sourceDir}`);
    }

    const preserveMode = options.preserveMode ?? config.preserveMode ?? false;
    const uploadStrategy = options.uploadStrategy ?? config.uploadStrategy ?? 'files';

    if (uploadStrategy === 'tar') {
        await uploadViaSshTar(sourceDir, remoteDestinationFolder, credentials, preserveMode, ui, state);
        return;
    }

    const allFiles = getAllFiles(sourceDir);
    const totalFiles = allFiles.length;
    const progress: ByteProgress = {
        totalBytes: getTotalBytes(allFiles),
        transferredBytes: 0,
    };

    for (let index = 0; index < allFiles.length; index++) {
        const localPath = allFiles[index];
        const progressLabel = totalFiles > 0 ? `[${index + 1}/${totalFiles}] ` : '';
        if (state.uploadedFiles.includes(localPath)) {
            ui.info(`${progressLabel}Skipping already uploaded file: ${localPath}`);
            const fileSize = fs.statSync(localPath).size;
            progress.transferredBytes += fileSize;
            logByteProgress(progress, ui);
            continue;
        }

        const relativePath = toPosix(path.relative(sourceDir, localPath));
        const remotePath = toPosix(path.posix.join(remoteDestinationFolder, relativePath));
        const remoteDirPath = path.posix.dirname(remotePath);

        const remoteMkdirCommand = `mkdir -p "${escapeDoubleQuotes(remoteDirPath)}"`;

        await new Promise<void>((resolve, reject) => {
            const mkdirProcess = createSshProcess(credentials, remoteMkdirCommand);
            let stderrBuffer = '';
            mkdirProcess.stderr?.on('data', (data) => {
                stderrBuffer += data.toString();
            });
            mkdirProcess.on('error', (error) => reject(mapSpawnError(error as NodeJS.ErrnoException, credentials)));
            mkdirProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`Failed to create remote directory: ${stderrBuffer.trim() || `exit code ${code}`}`));
            });
        });

        await new Promise<void>((resolve, reject) => {
            ui.step(`${progressLabel}Uploading ${localPath} to ${remotePath}`);
            const remoteWriteCommand = `cat > "${escapeDoubleQuotes(remotePath)}"`;
            const sshProcess = createSshProcess(credentials, remoteWriteCommand);
            let stderrBuffer = '';

            sshProcess.stderr?.on('data', (data) => {
                stderrBuffer += data.toString();
            });

            sshProcess.on('error', (error) => reject(mapSpawnError(error as NodeJS.ErrnoException, credentials)));

            const readStream = fs.createReadStream(localPath);
            readStream.on('data', (chunk) => {
                progress.transferredBytes += chunk.length;
                logByteProgress(progress, ui);
            });
            readStream.on('error', (error) => {
                sshProcess.kill();
                reject(error);
            });

            sshProcess.on('close', (code) => {
                if (code === 0) {
                    state.uploadedFiles.push(localPath);
                    saveState(state);
                    ui.success(`Successfully uploaded: ${localPath}`);
                    resolve();
                    return;
                }
                const details = stderrBuffer.trim();
                reject(new Error(`SSH upload failed for ${localPath}: ${details || `exit code ${code}`}`));
            });

            if (!sshProcess.stdin) {
                sshProcess.kill();
                reject(new Error('SSH upload failed to initialize stdin.'));
                return;
            }

            sshProcess.stdin.on('error', (error) => {
                reject(new Error(`SSH upload failed for ${localPath}: ${error.message}`));
            });

            readStream.pipe(sshProcess.stdin);
        });

        if (preserveMode) {
            const mode = (fs.statSync(localPath).mode & 0o777).toString(8);
            const chmodCommand = `chmod ${mode} "${escapeDoubleQuotes(remotePath)}"`;
            await new Promise<void>((resolve, reject) => {
                const chmodProcess = createSshProcess(credentials, chmodCommand);
                let stderrBuffer = '';
                chmodProcess.stderr?.on('data', (data) => {
                    stderrBuffer += data.toString();
                });
                chmodProcess.on('error', (error) => reject(mapSpawnError(error as NodeJS.ErrnoException, credentials)));
                chmodProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                        return;
                    }
                    reject(new Error(`Failed to preserve permissions for ${localPath}: ${stderrBuffer.trim() || `exit code ${code}`}`));
                });
            });
        }
    }
};
