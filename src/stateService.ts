import * as vscode from "vscode";
import { LastExportChoices } from "./types";

const STATE_KEY = "codeDump.lastExportChoices";

export class StateService {
  private context: vscode.ExtensionContext | null = null;

  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  getLastChoices(): LastExportChoices | undefined {
    if (!this.context) return undefined;
    return this.context.globalState.get<LastExportChoices>(STATE_KEY);
  }

  async saveLastChoices(choices: LastExportChoices): Promise<void> {
    if (!this.context) return;
    await this.context.globalState.update(STATE_KEY, choices);
  }

  async clearLastChoices(): Promise<void> {
    if (!this.context) return;
    await this.context.globalState.update(STATE_KEY, undefined);
  }
}
