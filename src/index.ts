#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Client } from 'basic-ftp';
import { NodeSSH } from 'node-ssh';
import inquirer from 'inquirer';

const configFilePath = path.join(process.cwd(), 'efoy-sync.json');
const logDir = path.join(process.cwd(), 'efoy-sync-logs');

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

const log = (message: string) => {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }
    const logFile = path.join(logDir, `log-${new Date().toISOString().split('T')[0]}.txt`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    console.log(message);
};

const handleError = (error: any) => {
    log(`ERROR: ${error.message}`);
    process.exit(1);
};

const runBuildCommand = (command: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        log(`Running build command: ${command}`);
        const buildProcess = exec(command);
        buildProcess.stdout?.on('data', (data) => console.log(data.toString()));
        buildProcess.stderr?.on('data', (data) => console.error(data.toString()));
        buildProcess.on('close', (code) => {
            if (code === 0) {
                log('Build command completed successfully.');
                resolve();
            } else {
                reject(new Error(`Build command failed with exit code ${code}`));
            }
        });
    });
};

const uploadViaFtp = async (config: Config) => {
    const client = new Client();
    client.ftp.verbose = true;
    try {
        log('Connecting to FTP server...');
        await client.access({
            host: config.ftp?.FTP_ADDRESS,
            user: config.ftp?.FTP_USERNAME,
            password: config.ftp?.FTP_PASSWORD,
        });
        log('FTP connection successful.');
        log(`Uploading files from ${config.final_folder} to ${config.destination_folder}`);
        await client.ensureDir(config.destination_folder);
        await client.uploadFromDir(config.final_folder, config.destination_folder);
        log('File upload completed successfully.');
    } catch (err) {
        handleError(err);
    } finally {
        client.close();
    }
};

const uploadViaSsh = async (config: Config) => {
    const ssh = new NodeSSH();
    try {
        log('Connecting to SSH server...');
        await ssh.connect({
            host: config.ssh!.host,
            username: config.ssh!.username,
            privateKey: fs.readFileSync(config.ssh!.privateKey, 'utf8'),
        });
        log('SSH connection successful.');
        log(`Uploading files from ${config.final_folder} to ${config.destination_folder}`);
        await ssh.putDirectory(config.final_folder, config.destination_folder, {
            recursive: true,
            concurrency: 10,
        });
        log('File upload completed successfully.');
    } catch (err) {
        handleError(err);
    } finally {
        ssh.dispose();
    }
};

const main = async () => {
    if (!fs.existsSync(configFilePath)) {
        log('efoy-sync.json not found. Please create it in your project root.');
        return;
    }

    const config: Config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

    if (config.run) {
        await runBuildCommand(config.run);
    }

    const { final_folder, destination_folder, method } = config;

    if (!final_folder || !destination_folder || !method) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }

    const questions = [
        {
            type: 'confirm',
            name: 'proceed',
            message: `You are about to sync the contents of '${final_folder}' to '${destination_folder}' on the remote server using ${method}. Do you want to proceed?`,
            default: true,
        },
    ];

    const answers = await inquirer.prompt(questions);

    if (answers.proceed) {
        if (method === 'ftp') {
            await uploadViaFtp(config);
        } else if (method === 'ssh') {
            await uploadViaSsh(config);
        } else {
            handleError(new Error('Invalid deployment method specified in efoy-sync.json'));
        }
        log('Deployment finished.');
    } else {
        log('Deployment cancelled by user.');
    }
};

main().catch(handleError);
