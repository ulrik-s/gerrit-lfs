/**
 * @license
 * Copyright (C) 2025 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {PluginApi} from '@gerritcodereview/typescript-api/plugin';
import {css, CSSResult, html, LitElement, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import '@gerritcodereview/typescript-api/gerrit';

interface ProjectConfigResponse {
  enabled?: boolean;
  max_object_size?: number;
  read_only?: boolean;
  backend?: string;
  namespace?: string;
  inherited?: boolean;
  available_backends?: Record<string, string>;
}

interface GlobalNamespaceConfig {
  enabled?: boolean;
  max_object_size?: number;
  read_only?: boolean;
  backend?: string;
}

interface GlobalConfigResponse {
  default_backend_type?: string;
  backends?: Record<string, string>;
  namespaces?: Record<string, GlobalNamespaceConfig>;
}

interface GlobalRow {
  name: string;
  enabled: boolean;
  readOnly: boolean;
  maxObjectSize: string;
  backend: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'gr-lfs': GrLfs;
  }
}

@customElement('gr-lfs')
export class GrLfs extends LitElement {
  @property({type: Object}) plugin!: PluginApi;

  @property({type: String}) repoName = '';

  @state() private projectConfig?: ProjectConfigResponse;
  @state() private availableBackends: Record<string, string> = {};
  @state() private overrideProject = false;
  @state() private projectForm = {
    enabled: false,
    readOnly: false,
    maxObjectSize: '',
    backend: '',
  };
  @state() private projectError?: string;
  @state() private savingProject = false;

  @state() private globalRows: GlobalRow[] = [];
  @state() private globalBackends: Record<string, string> = {};
  @state() private globalDefaultBackend?: string;
  @state() private globalError?: string;
  @state() private savingGlobal = false;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadData();
  }

  static override get styles(): CSSResult[] {
    return [
      window.Gerrit?.styles.form as CSSResult,
      css`
        :host {
          display: block;
        }

        fieldset {
          border: none;
          padding: 0;
          margin: 0 0 24px;
        }

        h2 {
          font-size: var(--font-size-h3, 20px);
          margin: 24px 0 12px;
        }

        section.field {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
        }

        section.field label {
          width: 180px;
          font-weight: var(--font-weight-bold, 600);
        }

        section.field .value {
          flex: 1;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .inputs {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px 16px;
          margin-bottom: 16px;
        }

        .inputs label {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .inputs label span {
          min-width: 120px;
        }

        .error {
          color: var(--error-text-color, #c0392b);
          margin-bottom: 12px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
        }

        table th,
        table td {
          padding: 8px;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
          text-align: left;
        }

        table input,
        table select {
          width: 100%;
          box-sizing: border-box;
        }

        .actions {
          display: flex;
          gap: 8px;
        }

        .secondary-text {
          color: var(--deemphasized-text-color, #5f6368);
          font-size: var(--font-size-small, 12px);
        }
      `,
    ];
  }

  override render() {
    if (!this.projectConfig) return nothing;

    return html`
      <fieldset class="gr-form-styles">
        <h2>Project LFS configuration</h2>
        ${this.renderProjectConfig()}
      </fieldset>
      ${this.repoName === 'All-Projects'
        ? html`
            <fieldset class="gr-form-styles">
              <h2>Global namespace policy</h2>
              ${this.renderGlobalConfig()}
            </fieldset>
          `
        : nothing}
    `;
  }

  private renderProjectConfig() {
    const availableBackends = Object.entries(this.availableBackends ?? {});
    const inherited = !this.overrideProject;
    const namespace = this.projectConfig?.namespace;

    return html`
      <section class="field">
        <label>Effective namespace</label>
        <div class="value">
          ${namespace ?? '—'}
          ${this.projectConfig?.inherited
            ? html`<div class="secondary-text">
                This project inherits its configuration.
              </div>`
            : nothing}
        </div>
      </section>
      <div class="toggle-row">
        <input
          id="override"
          type="checkbox"
          .checked=${this.overrideProject}
          @change=${this.onOverrideToggle}
        />
        <label for="override">Override global settings for ${this.repoName}</label>
      </div>
      ${this.projectError ? html`<div class="error">${this.projectError}</div>` : nothing}
      <div class="inputs">
        <label>
          <span>Enabled</span>
          <input
            type="checkbox"
            .checked=${this.projectForm.enabled}
            ?disabled=${inherited || this.savingProject}
            @change=${(e: Event) => this.onProjectCheckboxChange(e, 'enabled')}
          />
        </label>
        <label>
          <span>Read only</span>
          <input
            type="checkbox"
            .checked=${this.projectForm.readOnly}
            ?disabled=${inherited || this.savingProject}
            @change=${(e: Event) => this.onProjectCheckboxChange(e, 'readOnly')}
          />
        </label>
        <label>
          <span>Max object size (bytes)</span>
          <input
            type="number"
            min="0"
            .value=${this.projectForm.maxObjectSize}
            ?disabled=${inherited || this.savingProject}
            @input=${(e: Event) => this.onProjectInputChange(e, 'maxObjectSize')}
          />
        </label>
        <label>
          <span>Backend</span>
          <select
            .value=${this.projectForm.backend}
            ?disabled=${inherited || this.savingProject}
            @change=${(e: Event) => this.onProjectInputChange(e, 'backend')}
          >
            <option value="">(use namespace backend)</option>
            ${availableBackends.map(
              ([id, type]) => html`<option value=${id}>${id} (${type})</option>`
            )}
          </select>
        </label>
      </div>
      <div class="actions">
        <button
          class="gr-button"
          ?disabled=${this.savingProject}
          @click=${this.onSaveProject}
        >
          ${this.overrideProject ? 'Save project settings' : 'Remove override'}
        </button>
        <button
          class="gr-button"
          ?disabled=${this.savingProject}
          @click=${this.reloadProjectConfig}
        >
          Reload
        </button>
      </div>
    `;
  }

  private renderGlobalConfig() {
    return html`
      <section class="field">
        <label>Default backend</label>
        <div class="value">
          ${this.globalDefaultBackend ?? 'Not configured'}
          <div class="secondary-text">
            Backends: ${Object.keys(this.globalBackends).length
              ? Object.entries(this.globalBackends)
                  .map(([name, type]) => `${name} (${type})`)
                  .join(', ')
              : 'No backends defined'}
          </div>
        </div>
      </section>
      ${this.globalError ? html`<div class="error">${this.globalError}</div>` : nothing}
      <table>
        <thead>
          <tr>
            <th style="width: 30%">Namespace</th>
            <th style="width: 15%">Enabled</th>
            <th style="width: 15%">Read only</th>
            <th style="width: 20%">Max object size</th>
            <th style="width: 20%">Backend</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.globalRows.length === 0
            ? html`<tr><td colspan="6" class="secondary-text">No namespaces configured.</td></tr>`
            : this.globalRows.map((row, index) =>
                html`<tr>
                  <td>
                    <input
                      type="text"
                      .value=${row.name}
                      ?disabled=${this.savingGlobal}
                      @input=${(e: Event) => this.onGlobalRowInput(e, index, 'name')}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      .checked=${row.enabled}
                      ?disabled=${this.savingGlobal}
                      @change=${(e: Event) => this.onGlobalRowCheckbox(e, index, 'enabled')}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      .checked=${row.readOnly}
                      ?disabled=${this.savingGlobal}
                      @change=${(e: Event) => this.onGlobalRowCheckbox(e, index, 'readOnly')}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      .value=${row.maxObjectSize}
                      ?disabled=${this.savingGlobal}
                      @input=${(e: Event) => this.onGlobalRowInput(e, index, 'maxObjectSize')}
                    />
                  </td>
                  <td>
                    <select
                      .value=${row.backend}
                      ?disabled=${this.savingGlobal}
                      @change=${(e: Event) => this.onGlobalRowInput(e, index, 'backend')}
                    >
                      <option value="">(inherit backend)</option>
                      ${Object.entries(this.globalBackends).map(
                        ([id, type]) => html`<option value=${id}>${id} (${type})</option>`
                      )}
                    </select>
                  </td>
                  <td>
                    <button
                      class="gr-button"
                      ?disabled=${this.savingGlobal}
                      @click=${() => this.removeGlobalRow(index)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>`
              )}
        </tbody>
      </table>
      <div class="actions">
        <button class="gr-button" ?disabled=${this.savingGlobal} @click=${this.addGlobalRow}>
          Add namespace
        </button>
        <button class="gr-button" ?disabled=${this.savingGlobal} @click=${this.saveGlobalConfig}>
          Save namespaces
        </button>
        <button class="gr-button" ?disabled=${this.savingGlobal} @click=${this.reloadGlobalConfig}>
          Reload
        </button>
      </div>
    `;
  }

  private async loadData() {
    await this.reloadProjectConfig();
    if (this.repoName === 'All-Projects') {
      await this.reloadGlobalConfig();
    }
  }

  private async reloadProjectConfig() {
    const encodedRepoName = encodeURIComponent(this.repoName);
    try {
      const response = (await this.plugin
        .restApi()
        .get(
          `/projects/${encodedRepoName}/${this.plugin.getPluginName()}~lfs:config-project`
        )) as ProjectConfigResponse | undefined;
      this.applyProjectConfig(response ?? {});
      this.projectError = undefined;
    } catch (err) {
      this.projectError = await this.readError(err);
    }
  }

  private applyProjectConfig(config: ProjectConfigResponse) {
    this.projectConfig = config;
    this.availableBackends = config.available_backends ?? {};
    const inherited = config.inherited !== undefined ? config.inherited : true;
    this.overrideProject = !inherited;
    this.projectForm = {
      enabled: config.enabled ?? false,
      readOnly: config.read_only ?? false,
      maxObjectSize:
        config.max_object_size !== undefined ? String(config.max_object_size) : '',
      backend: config.backend ?? '',
    };
  }

  private onOverrideToggle(e: Event) {
    const target = e.target as HTMLInputElement;
    this.overrideProject = target.checked;
    if (!this.overrideProject) {
      // Keep the form values but the save button will remove the override.
    }
  }

  private onProjectCheckboxChange(e: Event, key: 'enabled' | 'readOnly') {
    const target = e.target as HTMLInputElement;
    this.projectForm = {...this.projectForm, [key]: target.checked};
  }

  private onProjectInputChange(
    e: Event,
    key: 'maxObjectSize' | 'backend'
  ) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    this.projectForm = {...this.projectForm, [key]: target.value};
  }

  private async onSaveProject() {
    this.projectError = undefined;

    if (!this.overrideProject) {
      await this.clearProjectOverride();
      return;
    }

    const payload: {[key: string]: unknown} = {
      enabled: this.projectForm.enabled,
      read_only: this.projectForm.readOnly,
    };

    if (this.projectForm.maxObjectSize.trim() !== '') {
      const parsed = Number(this.projectForm.maxObjectSize);
      if (!Number.isFinite(parsed) || parsed < 0) {
        this.projectError = 'Max object size must be a non-negative number.';
        return;
      }
      payload['max_object_size'] = parsed;
    }

    if (this.projectForm.backend.trim() !== '') {
      payload['backend'] = this.projectForm.backend.trim();
    }

    this.savingProject = true;
    try {
      const encodedRepoName = encodeURIComponent(this.repoName);
      const response = (await this.plugin
        .restApi()
        .put(
          `/projects/${encodedRepoName}/${this.plugin.getPluginName()}~lfs:config-project`,
          payload
        )) as ProjectConfigResponse | undefined;
      this.applyProjectConfig(response ?? {});
      window.Gerrit?.showToast?.('Updated project LFS configuration');
    } catch (err) {
      this.projectError = await this.readError(err);
    } finally {
      this.savingProject = false;
    }
  }

  private async clearProjectOverride() {
    this.savingProject = true;
    try {
      const encodedRepoName = encodeURIComponent(this.repoName);
      const response = (await this.plugin
        .restApi()
        .put(
          `/projects/${encodedRepoName}/${this.plugin.getPluginName()}~lfs:config-project`,
          {remove: true}
        )) as ProjectConfigResponse | undefined;
      this.applyProjectConfig(response ?? {});
      window.Gerrit?.showToast?.('Removed project-specific LFS configuration');
    } catch (err) {
      this.projectError = await this.readError(err);
    } finally {
      this.savingProject = false;
    }
  }

  private async reloadGlobalConfig() {
    try {
      const response = (await this.plugin
        .restApi()
        .get(
          `/projects/All-Projects/${this.plugin.getPluginName()}~lfs:config-global`
        )) as GlobalConfigResponse | undefined;
      this.applyGlobalConfig(response ?? {});
      this.globalError = undefined;
    } catch (err) {
      this.globalError = await this.readError(err);
    }
  }

  private applyGlobalConfig(config: GlobalConfigResponse) {
    this.globalBackends = config.backends ?? {};
    this.globalDefaultBackend = config.default_backend_type ?? undefined;
    const namespaces = config.namespaces ?? {};
    this.globalRows = Object.entries(namespaces).map(([name, info]) => ({
      name,
      enabled: info.enabled ?? false,
      readOnly: info.read_only ?? false,
      maxObjectSize:
        info.max_object_size !== undefined ? String(info.max_object_size) : '',
      backend: info.backend ?? '',
    }));
  }

  private addGlobalRow = () => {
    this.globalRows = [
      ...this.globalRows,
      {name: '', enabled: false, readOnly: false, maxObjectSize: '', backend: ''},
    ];
  };

  private removeGlobalRow(index: number) {
    this.globalRows = this.globalRows.filter((_, i) => i !== index);
  }

  private onGlobalRowInput(
    e: Event,
    index: number,
    key: 'name' | 'maxObjectSize' | 'backend'
  ) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const rows = [...this.globalRows];
    rows[index] = {...rows[index], [key]: target.value};
    this.globalRows = rows;
  }

  private onGlobalRowCheckbox(
    e: Event,
    index: number,
    key: 'enabled' | 'readOnly'
  ) {
    const target = e.target as HTMLInputElement;
    const rows = [...this.globalRows];
    rows[index] = {...rows[index], [key]: target.checked};
    this.globalRows = rows;
  }

  private async saveGlobalConfig() {
    this.globalError = undefined;
    const namespaces: {[key: string]: GlobalNamespaceConfig} = {};

    for (const row of this.globalRows) {
      const name = row.name.trim();
      if (!name) {
        continue;
      }

      const entry: GlobalNamespaceConfig = {
        enabled: row.enabled,
        read_only: row.readOnly,
      };

      if (row.maxObjectSize.trim() !== '') {
        const parsed = Number(row.maxObjectSize);
        if (!Number.isFinite(parsed) || parsed < 0) {
          this.globalError = `Namespace ${name}: max object size must be a non-negative number.`;
          return;
        }
        entry.max_object_size = parsed;
      }

      if (row.backend.trim() !== '') {
        entry.backend = row.backend.trim();
      }

      namespaces[name] = entry;
    }

    this.savingGlobal = true;
    try {
      const response = (await this.plugin
        .restApi()
        .put(
          `/projects/All-Projects/${this.plugin.getPluginName()}~lfs:config-global`,
          {namespaces}
        )) as GlobalConfigResponse | undefined;
      this.applyGlobalConfig(response ?? {});
      window.Gerrit?.showToast?.('Saved global LFS namespaces');
    } catch (err) {
      this.globalError = await this.readError(err);
    } finally {
      this.savingGlobal = false;
    }
  }

  private async readError(err: unknown): Promise<string> {
    if (!err) return 'Unknown error';
    if (err instanceof Response) {
      try {
        const text = await err.text();
        if (text) return text;
      } catch {
        // ignore
      }
      return `${err.status} ${err.statusText}`;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
}
