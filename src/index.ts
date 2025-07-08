#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { CustomFtpClient } from './services/ftp';
import { confirm } from './services/prompt';

const configFilePath = path.join(process.cwd(), 'efoy-sync.json');
interface Config {
    run?: string;
    final_folder: string;
    destination_folder: string;
    method: 'ftp' | 'ssh';
    ftp?: {
        FTP_USERNAME?: string;
        FTP_PASSWORD?: string;
        FTP_ADDRESS?: string;
    };
    ssh?: {
        host: string;
        username: string;
        privateKey: string;
    };
}

const logDir = path.join(process.cwd(), 'efoy-sync-logs');

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

const runBuildCommand = (command: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        ui.step(`Running build command: ${command}`);
        const buildProcess = exec(command);
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
    });
};

const uploadViaFtp = async (config: Config) => {
    const client = new CustomFtpClient(config.ftp!.FTP_ADDRESS!);
    try {
        ui.step('Connecting to FTP server...');
        await client.connect(config.ftp!.FTP_USERNAME!, config.ftp!.FTP_PASSWORD!);
        ui.success('FTP connection successful.');
        ui.step(`Uploading files from ${config.final_folder} to ${config.destination_folder}`);
        await client.ensureDir(config.destination_folder);
        await client.uploadFromDir(config.final_folder, config.destination_folder);
        ui.success('File upload completed successfully.');
    } catch (err) {
        handleError(err);
    } finally {
        client.close();
    }
};

const uploadViaSsh = async (config: Config) => {
    const { host, username, privateKey } = config.ssh!;
    const sourceDir = `${config.final_folder}/.`;
    const scpCommand = `scp -r -i ${privateKey} "${sourceDir}" ${username}@${host}:"${config.destination_folder}"`;

    return new Promise<void>((resolve, reject) => {
        ui.step('Uploading files via SCP...');
        exec(scpCommand, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = `SCP failed with error: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`;
                ui.error(errorMessage);
                return reject(new Error(errorMessage));
            }
            if (stderr) {
                ui.warn(`SCP stderr (non-fatal): ${stderr}`);
            }
            ui.info(`SCP stdout: ${stdout}`);
            ui.success('File upload completed successfully.');
            resolve();
        });
    });
};

const main = async () => {
    ui.log('🚀 Starting efoy-sync...', ui.icons.rocket, ui.colors.cyan);

    const defaultConfigContent = JSON.stringify({
        "run": "npm run build",
        "final_folder": "dist",
        "destination_folder": "/var/www/html",
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

    if (config.run) {
        await runBuildCommand(config.run);
    }

    const { final_folder, destination_folder, method } = config;

    if (!final_folder || !destination_folder || !method) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }

    const proceed = await confirm(`You are about to sync the contents of '${final_folder}' to '${destination_folder}' on the remote server using ${method}. Do you want to proceed?`);

    if (proceed) {
        ui.step(`Starting deployment via ${method}...`);
        if (method === 'ftp') {
            await uploadViaFtp(config);
        } else if (method === 'ssh') {
            await uploadViaSsh(config);
        } else {
            handleError(new Error('Invalid deployment method specified in efoy-sync.json'));
        }
        ui.log('🎉 Deployment finished successfully!', ui.icons.finish, ui.colors.green);
    } else {
        ui.log('🛑 Deployment cancelled by user.', ui.icons.cancel, ui.colors.yellow);
    }
};

main().catch(handleError);
