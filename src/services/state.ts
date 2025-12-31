import * as fs from 'fs';
import * as path from 'path';

const stateFilePath = path.join(process.cwd(), '.efoy-sync.state.json');

export interface SyncState {
    uploadedFiles: string[];
    completedSteps: Array<string | number>;
}

const withDefaults = (partial: Partial<SyncState> | undefined): SyncState => ({
    uploadedFiles: Array.isArray(partial?.uploadedFiles) ? partial!.uploadedFiles : [],
    completedSteps: Array.isArray(partial?.completedSteps) ? partial!.completedSteps : [],
});

export const loadState = (): SyncState => {
    if (fs.existsSync(stateFilePath)) {
        try {
            const content = fs.readFileSync(stateFilePath, 'utf8');
            const parsed = JSON.parse(content) as Partial<SyncState>;
            return withDefaults(parsed);
        } catch (error) {
            console.error('Failed to parse state file:', error);
            return withDefaults(undefined);
        }
    }
    return withDefaults(undefined);
};

export const saveState = (state: SyncState): void => {
    const normalized = withDefaults(state);
    fs.writeFileSync(stateFilePath, JSON.stringify(normalized, null, 2));
};

export const clearState = (): void => {
    if (fs.existsSync(stateFilePath)) {
        fs.unlinkSync(stateFilePath);
    }
};
