import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ByteProgress, logByteProgress } from './progress';
import { SyncState, saveState } from './state';

export interface UploadViaLocalOptions {
    sourceDir?: string;
    destinationDir?: string;
    preserveMode?: boolean;
}

interface LocalUploadProgress extends ByteProgress {
    totalFiles: number;
    processedFiles: number;
}

const expandHome = (input: string): string => {
    if (input === '~') {
        return os.homedir();
    }
    if (input.startsWith(`~${path.sep}`) || input.startsWith('~/')) {
        return path.join(os.homedir(), input.slice(2));
    }
    return input;
};

const resolveLocalPath = (input: string): string => path.resolve(expandHome(input));

const isSameOrInside = (parentPath: string, childPath: string): boolean => {
    const relative = path.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const getAllFiles = (dirPath: string, results: string[] = []): string[] => {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
        const absolute = path.join(dirPath, entry);
        if (fs.statSync(absolute).isDirectory()) {
            getAllFiles(absolute, results);
        } else {
            results.push(absolute);
        }
    }
    return results;
};

const getTotalBytes = (filePaths: string[]): number => filePaths.reduce((total, filePath) => {
    return total + fs.statSync(filePath).size;
}, 0);

const ensureWritableDestination = (destinationDir: string): void => {
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.accessSync(destinationDir, fs.constants.W_OK);
};

const destinationMatchesSource = (sourcePath: string, destinationPath: string): boolean => {
    if (!fs.existsSync(destinationPath)) {
        return false;
    }
    const sourceStat = fs.statSync(sourcePath);
    const destinationStat = fs.statSync(destinationPath);
    return sourceStat.size === destinationStat.size && destinationStat.isFile();
};

const renameIntoPlace = async (temporaryPath: string, destinationPath: string): Promise<void> => {
    try {
        await fs.promises.rename(temporaryPath, destinationPath);
    } catch (error) {
        const typedError = error as NodeJS.ErrnoException;
        if (typedError.code !== 'EEXIST' && typedError.code !== 'EPERM') {
            throw error;
        }
        await fs.promises.rm(destinationPath, { force: true });
        await fs.promises.rename(temporaryPath, destinationPath);
    }
};

const copyFileRecoverably = async (
    sourcePath: string,
    destinationPath: string,
    preserveMode: boolean,
    progress: LocalUploadProgress,
    ui: any,
): Promise<void> => {
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    const sourceStat = await fs.promises.stat(sourcePath);
    const temporaryPath = path.join(
        path.dirname(destinationPath),
        `.${path.basename(destinationPath)}.efoy-sync-${process.pid}-${Date.now()}.tmp`,
    );

    try {
        await new Promise<void>((resolve, reject) => {
            const readStream = fs.createReadStream(sourcePath);
            const writeStream = fs.createWriteStream(temporaryPath, { mode: sourceStat.mode });

            readStream.on('data', (chunk) => {
                progress.transferredBytes += chunk.length;
                logByteProgress(progress, ui);
            });
            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            readStream.pipe(writeStream);
        });

        if (preserveMode) {
            await fs.promises.chmod(temporaryPath, sourceStat.mode & 0o777);
        }
        await renameIntoPlace(temporaryPath, destinationPath);
    } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
};

export const uploadViaLocal = async (
    config: {
        final_folder?: string;
        destination_folder?: string;
        sourceDir?: string;
        destinationDir?: string;
        preserveMode?: boolean;
    },
    ui: any,
    state: SyncState,
    options: UploadViaLocalOptions = {},
): Promise<void> => {
    const rawSourceDir = options.sourceDir ?? config.sourceDir ?? config.final_folder;
    const rawDestinationDir = options.destinationDir ?? config.destinationDir ?? config.destination_folder;

    if (!rawSourceDir || !rawDestinationDir) {
        throw new Error('Invalid run configuration.');
    }

    const sourceDir = resolveLocalPath(rawSourceDir);
    const destinationDir = resolveLocalPath(rawDestinationDir);

    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error(`Source directory for local upload does not exist: ${sourceDir}`);
    }
    if (isSameOrInside(sourceDir, destinationDir)) {
        throw new Error('Local destination directory must not be the source directory or inside the source directory.');
    }

    const preserveMode = options.preserveMode ?? config.preserveMode ?? false;
    ensureWritableDestination(destinationDir);

    const allFiles = getAllFiles(sourceDir);
    const progress: LocalUploadProgress = {
        totalFiles: allFiles.length,
        processedFiles: 0,
        totalBytes: getTotalBytes(allFiles),
        transferredBytes: 0,
    };

    ui.step(`Copying files locally from ${sourceDir} to ${destinationDir}`);

    for (let index = 0; index < allFiles.length; index++) {
        const sourcePath = allFiles[index];
        const relativePath = path.relative(sourceDir, sourcePath);
        const destinationPath = path.join(destinationDir, relativePath);
        const progressLabel = progress.totalFiles > 0 ? `[${index + 1}/${progress.totalFiles}] ` : '';

        if (state.uploadedFiles.includes(sourcePath) && destinationMatchesSource(sourcePath, destinationPath)) {
            ui.info(`${progressLabel}Skipping already copied file: ${sourcePath}`);
            progress.processedFiles += 1;
            progress.transferredBytes += fs.statSync(sourcePath).size;
            logByteProgress(progress, ui);
            continue;
        }

        ui.step(`${progressLabel}Copying file: ${sourcePath} to ${destinationPath}`);
        await copyFileRecoverably(sourcePath, destinationPath, preserveMode, progress, ui);
        if (!state.uploadedFiles.includes(sourcePath)) {
            state.uploadedFiles.push(sourcePath);
        }
        progress.processedFiles += 1;
        saveState(state);
        ui.success(`Successfully copied: ${sourcePath}`);
    }

    ui.success('Local file copy completed successfully.');
};
