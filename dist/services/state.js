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
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearState = exports.saveState = exports.loadState = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stateFilePath = path.join(process.cwd(), '.efoy-sync.state.json');
const withDefaults = (partial) => ({
    uploadedFiles: Array.isArray(partial === null || partial === void 0 ? void 0 : partial.uploadedFiles) ? partial.uploadedFiles : [],
    completedSteps: Array.isArray(partial === null || partial === void 0 ? void 0 : partial.completedSteps) ? partial.completedSteps : [],
});
const loadState = () => {
    if (fs.existsSync(stateFilePath)) {
        try {
            const content = fs.readFileSync(stateFilePath, 'utf8');
            const parsed = JSON.parse(content);
            return withDefaults(parsed);
        }
        catch (error) {
            console.error('Failed to parse state file:', error);
            return withDefaults(undefined);
        }
    }
    return withDefaults(undefined);
};
exports.loadState = loadState;
const saveState = (state) => {
    const normalized = withDefaults(state);
    fs.writeFileSync(stateFilePath, JSON.stringify(normalized, null, 2));
};
exports.saveState = saveState;
const clearState = () => {
    if (fs.existsSync(stateFilePath)) {
        fs.unlinkSync(stateFilePath);
    }
};
exports.clearState = clearState;
