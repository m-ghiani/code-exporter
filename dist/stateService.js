"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateService = void 0;
const STATE_KEY = "codeDump.lastExportChoices";
class StateService {
    context = null;
    setContext(context) {
        this.context = context;
    }
    getLastChoices() {
        if (!this.context)
            return undefined;
        return this.context.globalState.get(STATE_KEY);
    }
    async saveLastChoices(choices) {
        if (!this.context)
            return;
        await this.context.globalState.update(STATE_KEY, choices);
    }
    async clearLastChoices() {
        if (!this.context)
            return;
        await this.context.globalState.update(STATE_KEY, undefined);
    }
}
exports.StateService = StateService;
//# sourceMappingURL=stateService.js.map