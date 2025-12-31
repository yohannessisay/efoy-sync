#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { CustomFtpClient, UploadProgress } from './services/ftp';
import { createSshProcess, uploadViaSsh, UploadViaSshOptions, SshCredentials } from './services/ssh';
import { confirm } from './services/prompt';
import { loadState, clearState, saveState, SyncState } from './services/state';

type StepTarget = 'local' | 'ssh';

interface BaseRunStep {
    name?: string;
    description?: string;
    order?: number;
    continueOnError?: boolean;
}

interface CommandRunStep extends BaseRunStep {
    type: 'command';
    command: string;
    target?: StepTarget;
    cwd?: string;
    env?: Record<string, string>;
    ssh?: Partial<SshCredentials>;
}

interface FtpCredentials {
    FTP_USERNAME: string;
    FTP_PASSWORD: string;
    FTP_ADDRESS: string;
}

interface UploadRunStep extends BaseRunStep {
    type: 'upload';
    sourceDir?: string;
    destinationDir?: string;
    method?: 'ftp' | 'ssh';
    preserveMode?: boolean;
    uploadStrategy?: 'files' | 'tar';
    ssh?: Partial<SshCredentials>;
    ftp?: Partial<FtpCredentials>;
}

type RunStep = CommandRunStep | UploadRunStep;

interface UploadViaFtpOptions {
    sourceDir?: string;
    destinationDir?: string;
    ftp?: Partial<FtpCredentials>;
}

const expandHomePath = (input: string): string => {
    if (!input.startsWith('~')) {
        return input;
    }
    return path.join(os.homedir(), input.slice(1));
};

const configFilePath = path.join(process.cwd(), 'efoy-sync.json');
interface Config {
    run?: string | Array<string | RunStep>;
    final_folder?: string;
    destination_folder?: string;
    sourceDir?: string;
    destinationDir?: string;
    method: 'ftp' | 'ssh';
    preserveMode?: boolean;
    uploadStrategy?: 'files' | 'tar';
    ftp?: {
        FTP_USERNAME?: string;
        FTP_PASSWORD?: string;
        FTP_ADDRESS?: string;
    };
    ssh?: SshCredentials;
}

const logDir = path.join(process.cwd(), 'efoy-sync-logs');

const getDefaultSourceDir = (config: Config): string => config.sourceDir ?? config.final_folder ?? '';
const getDefaultDestinationDir = (config: Config): string => config.destinationDir ?? config.destination_folder ?? '';

const listLocalFiles = (dirPath: string, results: string[] = []): string[] => {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
        const absolute = path.join(dirPath, entry);
        if (fs.statSync(absolute).isDirectory()) {
            listLocalFiles(absolute, results);
        } else {
            results.push(absolute);
        }
    }
    return results;
};

const getTotalBytes = (filePaths: string[]): number => filePaths.reduce((total, filePath) => {
    return total + fs.statSync(filePath).size;
}, 0);

const sortObject = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(sortObject);
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        const result: Record<string, unknown> = {};
        for (const [key, entryValue] of entries) {
            result[key] = sortObject(entryValue);
        }
        return result;
    }
    return value;
};

const hashStep = (step: RunStep, config: Config): string => {
    if (step.type === 'command') {
        const target = step.target ?? 'local';
        const env = step.env
            ? Object.keys(step.env)
                .sort()
                .reduce<Record<string, string>>((acc, key) => {
                    acc[key] = step.env![key];
                    return acc;
                }, {})
            : undefined;
        const normalized = {
            type: step.type,
            target,
            command: step.command,
            cwd: step.cwd,
            env,
            ssh: target === 'ssh' ? resolveSshConfig(config, step.ssh) : undefined,
        };
        const payload = JSON.stringify(sortObject(normalized));
        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    const method = step.method ?? config.method;
    const sourceDir = step.sourceDir ?? getDefaultSourceDir(config);
    const destinationDir = step.destinationDir ?? getDefaultDestinationDir(config);
    const preserveMode = step.preserveMode ?? config.preserveMode ?? false;
    const uploadStrategy = step.uploadStrategy ?? config.uploadStrategy ?? 'files';
    const ftpConfig = {
        FTP_USERNAME: step.ftp?.FTP_USERNAME ?? config.ftp?.FTP_USERNAME,
        FTP_PASSWORD: step.ftp?.FTP_PASSWORD ?? config.ftp?.FTP_PASSWORD,
        FTP_ADDRESS: step.ftp?.FTP_ADDRESS ?? config.ftp?.FTP_ADDRESS,
    };
    const normalized = {
        type: step.type,
        method,
        sourceDir,
        destinationDir,
        preserveMode,
        uploadStrategy,
        ftp: method === 'ftp' ? ftpConfig : undefined,
        ssh: method === 'ssh' ? resolveSshConfig(config, step.ssh) : undefined,
    };
    const payload = JSON.stringify(sortObject(normalized));
    return crypto.createHash('sha256').update(payload).digest('hex');
};

const normalizeCompletedSteps = (completedSteps: Array<string | number>, stepHashes: string[]): string[] => {
    const hashSet = new Set(stepHashes);
    const resolved = new Set<string>();
    for (const entry of completedSteps) {
        if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < stepHashes.length) {
            resolved.add(stepHashes[entry]);
            continue;
        }
        if (typeof entry === 'string' && hashSet.has(entry)) {
            resolved.add(entry);
        }
    }
    return Array.from(resolved);
};

const ui: any = {
    colors: {
        reset: "\x1b[0m",
        green: "\x1b[32m",
        red: "\x1b[31m",
        blue: "\x1b[34m",
        yellow: "\x1b[33m",
        cyan: "\x1b[36m",
    },
    icons: {
        rocket: '🚀',
        gear: '⚙️',
        success: '✓',
        error: '✗',
        info: 'ℹ️',
        warn: '⚠️',
        sync: '🔄',
        upload: '📤',
        connect: '🔌',
        build: '🛠️',
        finish: '🎉',
        cancel: '🛑',
    },
    log: (message: string, icon: string = ' ', color: string = ui.colors.reset) => {
        const coloredMessage = `${color}${icon} ${message}${ui.colors.reset}`;
        console.log(coloredMessage);

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }
        const logFile = path.join(logDir, `log-${new Date().toISOString().split('T')[0]}.txt`);
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    },
    info: (message: string) => ui.log(message, ui.icons.info, ui.colors.blue),
    success: (message: string) => ui.log(message, ui.icons.success, ui.colors.green),
    error: (message: string) => ui.log(message, ui.icons.error, ui.colors.red),
    warn: (message: string) => ui.log(message, ui.icons.warn, ui.colors.yellow),
    step: (message: string) => ui.log(message, ui.icons.gear, ui.colors.cyan),
};

const handleError = (error: any) => {
    let errorMessage = error.message;

    // Check for common configuration-related errors
    const configErrorPatterns = [
        /Could not resolve hostname/i,
        /Identity file .* not accessible/i,
        /Permission denied/i,
        /scp: Connection closed/i,
        /Invalid PASV response/i,
        /FTP user command failed/i,
        /FTP pass command failed/i,
        /FTP response timeout/i,
        /FTP STOR command failed/i,
        /Failed to create directory/i,
        /Unexpected FTP welcome message/i,
        /Missing required fields in efoy-sync.json/i,
        /Invalid deployment method specified in efoy-sync.json/i,
        /Invalid upload strategy specified in efoy-sync.json/i,
        /FTP configuration is missing or incomplete/i,
        /Source directory for FTP upload does not exist/i,
        /Source directory for SSH upload does not exist/i,
        /SSH configuration is missing/i,
        /SSH authentication is missing/i,
        /sshpass/i,
        /Invalid run step definition/i,
        /Unsupported run step type/i,
        /Invalid run configuration/i,
    ];

    const isConfigError = configErrorPatterns.some(pattern => pattern.test(errorMessage));

    if (isConfigError) {
        ui.error('It looks like there\'s a problem with your efoy-sync.json configuration. Please double-check your server address, username, password, and private key path for the selected deployment method (FTP or SSH).');
        ui.info(`Original error details: ${errorMessage}`);
    } else {
        ui.error(`An unexpected error occurred: ${errorMessage}`);
    }
    process.exit(1);
};

const runCommand = (
    command: string,
    options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<void> => {
    return new Promise((resolve, reject) => {
        ui.step(`Running command: ${command}`);
        const spawnOptions = {
            cwd: options.cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            shell: true,
        };
        const buildProcess = spawn(command, [], spawnOptions);
        buildProcess.stdout?.on('data', (data) => ui.info(data.toString()));
        buildProcess.stderr?.on('data', (data) => ui.warn(data.toString()));
        buildProcess.on('close', (code) => {
            if (code === 0) {
                ui.success('Build command completed successfully.');
                resolve();
            } else {
                reject(new Error(`Build command failed with exit code ${code}`));
            }
        });
        buildProcess.on('error', (error) => reject(error));
    });
};

const resolveSshConfig = (config: Config, overrides?: Partial<SshCredentials>): SshCredentials => {
    const base = config.ssh;
    if (!base && !overrides) {
        throw new Error('SSH configuration is missing.');
    }
    const resolved: SshCredentials = {
        host: overrides?.host ?? base?.host ?? '',
        username: overrides?.username ?? base?.username ?? '',
        privateKey: overrides?.privateKey ?? base?.privateKey,
        password: overrides?.password ?? base?.password,
    };

    if (!resolved.host || !resolved.username) {
        throw new Error('SSH configuration is missing.');
    }
    if (!resolved.privateKey && !resolved.password) {
        throw new Error('SSH authentication is missing.');
    }

    return resolved;
};

const runRemoteCommand = (
    command: string,
    config: Config,
    step: CommandRunStep,
): Promise<void> => {
    const ssh = resolveSshConfig(config, step.ssh);
    return new Promise((resolve, reject) => {
        const spawnOptions = {
            env: step.env ? { ...process.env, ...step.env } : process.env,
        };
        const remoteProcess = createSshProcess(ssh, command, spawnOptions);
        const usesPassword = Boolean(ssh.password && !ssh.privateKey);
        remoteProcess.stdout?.on('data', (data) => ui.info(data.toString()));
        remoteProcess.stderr?.on('data', (data) => ui.warn(data.toString()));
        remoteProcess.on('close', (code) => {
            if (code === 0) {
                ui.success('Remote command completed successfully.');
                resolve();
            } else {
                reject(new Error(`Remote command failed with exit code ${code}`));
            }
        });
        remoteProcess.on('error', (error) => {
            const typedError = error as NodeJS.ErrnoException;
            if (usesPassword && typedError.code === 'ENOENT') {
                reject(new Error('SSH password authentication requires sshpass. Install sshpass or use privateKey.'));
                return;
            }
            reject(error);
        });
    });
};

const uploadViaFtp = async (
    config: Config,
    ui: any,
    state: SyncState,
    options: UploadViaFtpOptions = {},
) => {
    const baseFtp = config.ftp;
    const mergedFtp: Partial<FtpCredentials> = {
        FTP_USERNAME: options.ftp?.FTP_USERNAME ?? baseFtp?.FTP_USERNAME,
        FTP_PASSWORD: options.ftp?.FTP_PASSWORD ?? baseFtp?.FTP_PASSWORD,
        FTP_ADDRESS: options.ftp?.FTP_ADDRESS ?? baseFtp?.FTP_ADDRESS,
    };

    if (!mergedFtp.FTP_ADDRESS || !mergedFtp.FTP_USERNAME || !mergedFtp.FTP_PASSWORD) {
        throw new Error('FTP configuration is missing or incomplete.');
    }

    const sourceDir = options.sourceDir ?? getDefaultSourceDir(config);
    const destinationDir = options.destinationDir ?? getDefaultDestinationDir(config);

    if (!sourceDir || !destinationDir) {
        throw new Error('Invalid run configuration.');
    }

    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error(`Source directory for FTP upload does not exist: ${sourceDir}`);
    }

    const client = new CustomFtpClient(mergedFtp.FTP_ADDRESS);
    try {
        ui.step('Connecting to FTP server...');
        await client.connect(mergedFtp.FTP_USERNAME, mergedFtp.FTP_PASSWORD);
        ui.success('FTP connection successful.');
        ui.step(`Uploading files from ${sourceDir} to ${destinationDir}`);
        await client.ensureDir(destinationDir);
        const totalFiles = listLocalFiles(sourceDir);
        const totalBytes = getTotalBytes(totalFiles);
        const progress: UploadProgress = {
            totalFiles: totalFiles.length,
            processedFiles: 0,
            totalBytes,
            transferredBytes: 0,
        };
        await client.uploadFromDir(sourceDir, destinationDir, state, ui, progress);
        ui.success('File upload completed successfully.');
    } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
    } finally {
        client.close();
    }
};

const createCommandStep = (command: string): CommandRunStep => ({
    type: 'command',
    command,
    target: 'local',
});

const normalizeRunSteps = (run: Config['run']): RunStep[] => {
    if (!run) {
        return [];
    }

    const entries = (Array.isArray(run) ? run : [run]) as unknown[];

    return entries.map((entry, index) => {
        if (typeof entry === 'string') {
            return createCommandStep(entry);
        }

        if (entry && typeof entry === 'object') {
            const candidate = entry as Record<string, unknown>;
            const inferredType = typeof candidate.type === 'string'
                ? candidate.type
                : typeof candidate.command === 'string'
                    ? 'command'
                    : undefined;

            if (!inferredType) {
                throw new Error(`Invalid run step definition at index ${index}. Missing 'type'.`);
            }

            if (inferredType === 'command') {
                const command = candidate.command;
                if (typeof command !== 'string' || command.trim() === '') {
                    throw new Error(`Invalid command step at index ${index}. 'command' must be a non-empty string.`);
                }

                const order = candidate.order;
                if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
                    throw new Error(`Invalid command step at index ${index}. 'order' must be a number.`);
                }

                const env = candidate.env;
                const envRecord = env && typeof env === 'object'
                    ? env as Record<string, string>
                    : undefined;

                const sshOverride = candidate.ssh && typeof candidate.ssh === 'object'
                    ? candidate.ssh as Partial<SshCredentials>
                    : undefined;

                const commandStep: CommandRunStep = {
                    type: 'command',
                    command,
                    target: (candidate.target as StepTarget | undefined) ?? 'local',
                    name: candidate.name as string | undefined,
                    description: candidate.description as string | undefined,
                    order: order as number | undefined,
                    cwd: candidate.cwd as string | undefined,
                    env: envRecord,
                    ssh: sshOverride,
                };

                if (candidate.continueOnError === true) {
                    commandStep.continueOnError = true;
                }

                return commandStep;
            }

            if (inferredType === 'upload') {
                const order = candidate.order;
                if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
                    throw new Error(`Invalid upload step at index ${index}. 'order' must be a number.`);
                }

                const rawSourceDir = candidate.sourceDir ?? candidate.source;
                if (rawSourceDir !== undefined && typeof rawSourceDir !== 'string') {
                    throw new Error(`Invalid upload step at index ${index}. 'sourceDir' must be a string.`);
                }

                const rawDestinationDir = candidate.destinationDir ?? candidate.destination;
                if (rawDestinationDir !== undefined && typeof rawDestinationDir !== 'string') {
                    throw new Error(`Invalid upload step at index ${index}. 'destinationDir' must be a string.`);
                }

                const preserveMode = candidate.preserveMode;
                if (preserveMode !== undefined && typeof preserveMode !== 'boolean') {
                    throw new Error(`Invalid upload step at index ${index}. 'preserveMode' must be a boolean.`);
                }

                const uploadStrategy = candidate.uploadStrategy;
                if (uploadStrategy !== undefined && uploadStrategy !== 'files' && uploadStrategy !== 'tar') {
                    throw new Error(`Invalid upload step at index ${index}. 'uploadStrategy' must be 'files' or 'tar'.`);
                }

                const sshOverride = candidate.ssh && typeof candidate.ssh === 'object'
                    ? candidate.ssh as Partial<SshCredentials>
                    : undefined;

                const ftpOverride = candidate.ftp && typeof candidate.ftp === 'object'
                    ? candidate.ftp as Partial<FtpCredentials>
                    : undefined;

                const uploadStep: UploadRunStep = {
                    type: 'upload',
                    sourceDir: rawSourceDir as string | undefined,
                    destinationDir: rawDestinationDir as string | undefined,
                    method: candidate.method as ('ftp' | 'ssh') | undefined,
                    name: candidate.name as string | undefined,
                    description: candidate.description as string | undefined,
                    order: order as number | undefined,
                    preserveMode: preserveMode as boolean | undefined,
                    uploadStrategy: uploadStrategy as 'files' | 'tar' | undefined,
                    ssh: sshOverride,
                    ftp: ftpOverride,
                };

                if (candidate.continueOnError === true) {
                    uploadStep.continueOnError = true;
                }

                return uploadStep;
            }

            throw new Error(`Unsupported run step type: ${String(inferredType)}`);
        }

        throw new Error(`Invalid run step definition at index ${index}.`);
    });
};

const sortRunSteps = (steps: RunStep[]): RunStep[] => {
    const indexed = steps.map((step, index) => ({ step, index }));
    const hasOrder = indexed.some(entry => typeof entry.step.order === 'number');
    if (!hasOrder) {
        return steps;
    }
    return indexed
        .sort((a, b) => {
            const aOrder = typeof a.step.order === 'number' ? a.step.order : Number.POSITIVE_INFINITY;
            const bOrder = typeof b.step.order === 'number' ? b.step.order : Number.POSITIVE_INFINITY;
            if (aOrder !== bOrder) {
                return aOrder - bOrder;
            }
            return a.index - b.index;
        })
        .map(entry => entry.step);
};

const describeStep = (step: RunStep, config: Config): string => {
    if (step.description) {
        return step.description;
    }

    if (step.type === 'command') {
        const location = (step.target ?? 'local') === 'ssh' ? 'remote (ssh)' : 'local';
        return `${location} command: ${step.command}`;
    }

    const method = (step.method ?? config.method).toUpperCase();
    const source = step.sourceDir ?? getDefaultSourceDir(config);
    const destination = step.destinationDir ?? getDefaultDestinationDir(config);
    return `Upload via ${method} from ${source} to ${destination}`;
};

const executeRunStep = async (
    step: RunStep,
    stepIndex: number,
    config: Config,
    state: SyncState,
): Promise<void> => {
    const label = step.name ?? describeStep(step, config);
    ui.step(`Step ${stepIndex + 1}: ${label}`);

    if (step.type === 'command') {
        if ((step.target ?? 'local') === 'ssh') {
            await runRemoteCommand(step.command, config, step);
        } else {
            await runCommand(step.command, { cwd: step.cwd, env: step.env });
        }
        return;
    }

    const method = step.method ?? config.method;
    if (method === 'ftp') {
        await uploadViaFtp(config, ui, state, {
            sourceDir: step.sourceDir,
            destinationDir: step.destinationDir,
            ftp: step.ftp,
        });
        return;
    }

    if (method === 'ssh') {
        const options: UploadViaSshOptions = {
            sourceDir: step.sourceDir,
            destinationDir: step.destinationDir,
            ssh: step.ssh,
            preserveMode: step.preserveMode,
            uploadStrategy: step.uploadStrategy,
        };
        await uploadViaSsh(config, ui, state, options);
        return;
    }

    throw new Error(`Unsupported upload method: ${method}`);
};


const main = async () => {
    ui.log('🚀 Starting efoy-sync...', ui.icons.rocket, ui.colors.cyan);

    const state: SyncState = loadState();

    if (state.uploadedFiles.length > 0 || state.completedSteps.length > 0) {
        const uploadedSummary = state.uploadedFiles.length > 0
            ? `${state.uploadedFiles.length} file(s) already uploaded`
            : 'no files uploaded yet';
        const completedSummary = state.completedSteps.length > 0
            ? `${state.completedSteps.length} step(s) completed`
            : 'no steps recorded';
        ui.warn(`Unfinished session detected (${uploadedSummary}, ${completedSummary}).`);
        const resume = await confirm('Do you want to resume the previous session?');
        if (!resume) {
            clearState();
            state.uploadedFiles = [];
            state.completedSteps = [];
            ui.info('Previous session cleared. Starting a fresh deployment.');
        } else {
            ui.info('Resuming previous session.');
        }
    }

    const defaultConfigContent = JSON.stringify({
        "run": [
            {
                "name": "Build project",
                "order": 1,
                "command": "npm run build",
                "target": "local"
            },
            {
                "type": "upload",
                "name": "Upload build",
                "order": 2
            }
        ],
        "sourceDir": "dist",
        "destinationDir": "/var/www/html",
        "method": "ssh",
        "ssh": {
            "host": "your_server_ip",
            "username": "your_username",
            "privateKey": "~/.ssh/id_rsa"
        },
        "ftp": {
            "FTP_USERNAME": "your_ftp_username",
            "FTP_PASSWORD": "your_ftp_password",
            "FTP_ADDRESS": "your_ftp_server"
        }
    }, null, 2);

    if (!fs.existsSync(configFilePath)) {
        ui.warn('efoy-sync.json not found.');
        const createConfig = await confirm('efoy-sync will now create the config file (efoy-sync.json) in your project root. Continue?');

        if (createConfig) {
            try {
                fs.writeFileSync(configFilePath, defaultConfigContent);
                ui.success('efoy-sync.json created successfully. Please edit it with your deployment details.');
            } catch (error: any) {
                ui.error(`Error creating efoy-sync.json: ${error.message}`);
                process.exit(1);
            }
        } else {
            ui.info('efoy-sync.json creation skipped. You can create it manually later.');
            process.exit(0);
        }
    }

    const config: Config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

    const method = config.method;
    if (!method) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }
    if (config.uploadStrategy && config.uploadStrategy !== 'files' && config.uploadStrategy !== 'tar') {
        handleError(new Error('Invalid upload strategy specified in efoy-sync.json'));
    }

    let normalizedSteps: RunStep[] = [];
    try {
        normalizedSteps = normalizeRunSteps(config.run);
    } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)));
    }

    const hasUploadStep = normalizedSteps.some(step => step.type === 'upload');
    if (!hasUploadStep) {
        normalizedSteps.push({ type: 'upload' });
    }
    normalizedSteps = sortRunSteps(normalizedSteps);

    const missingUploadDefaults = normalizedSteps
        .filter(step => step.type === 'upload')
        .some(step => {
            const source = step.sourceDir ?? getDefaultSourceDir(config);
            const destination = step.destinationDir ?? getDefaultDestinationDir(config);
            return !source || !destination;
        });

    if (missingUploadDefaults) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }

    let stepHashes: string[] = [];
    try {
        stepHashes = normalizedSteps.map(step => hashStep(step, config));
    } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)));
    }

    state.completedSteps = normalizeCompletedSteps(state.completedSteps, stepHashes);

    ui.info('Planned actions:');
    normalizedSteps.forEach((step, index) => {
        ui.info(`${index + 1}. ${describeStep(step, config)}`);
    });

    const proceed = await confirm(`You are about to execute ${normalizedSteps.length} step(s) using ${method}. Do you want to proceed?`);

    if (!proceed) {
        ui.log('🛑 Deployment cancelled by user.', ui.icons.cancel, ui.colors.yellow);
        return;
    }

    try {
        for (let i = 0; i < normalizedSteps.length; i++) {
            const step = normalizedSteps[i];

            const stepHash = stepHashes[i];
            if (state.completedSteps.includes(stepHash)) {
                ui.info(`Skipping step ${i + 1}; already completed in previous session.`);
                continue;
            }

            try {
                await executeRunStep(step, i, config, state);
                if (!state.completedSteps.includes(stepHash)) {
                    state.completedSteps.push(stepHash);
                }
                saveState(state);
            } catch (stepError) {
                if (step.continueOnError) {
                    ui.warn(`Step ${i + 1} failed but continueOnError is true. Error: ${(stepError as Error).message}`);
                    if (!state.completedSteps.includes(stepHash)) {
                        state.completedSteps.push(stepHash);
                    }
                    saveState(state);
                    continue;
                }
                throw stepError;
            }
        }
    } catch (error) {
        handleError(error);
    }

    clearState();
    ui.log('🎉 Deployment finished successfully!', ui.icons.finish, ui.colors.green);
};

main().catch(handleError);
