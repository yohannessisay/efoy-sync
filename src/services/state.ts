import * as fs from 'fs';
import * as path from 'path';

const stateFilePath = path.join(process.cwd(), '.efoy-sync.state.json');

export interface SyncState {
    uploadedFiles: string[];
}

export const loadState = (): SyncState => {
    if (fs.existsSync(stateFilePath)) {
        try {
            const content = fs.readFileSync(stateFilePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to parse state file:', error); 
            return { uploadedFiles: [] };
        }
    }
    return { uploadedFiles: [] };
};

export const saveState = (state: SyncState): void => {
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
};

export const clearState = (): void => {
    if (fs.existsSync(stateFilePath)) {
        fs.unlinkSync(stateFilePath);
    }
};
