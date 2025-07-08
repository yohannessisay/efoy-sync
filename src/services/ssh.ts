import { exec } from 'child_process';

export const uploadViaSsh = (config: any, ui: any): Promise<void> => {
    const { host, username, privateKey } = config.ssh!;
    const sourceDir = `${config.final_folder}/.`
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