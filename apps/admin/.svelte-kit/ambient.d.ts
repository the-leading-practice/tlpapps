
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://kit.svelte.dev/docs/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```bash
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const AI_AGENT: string;
	export const ALLUSERSPROFILE: string;
	export const AMDRMSDKPATH: string;
	export const ANDROID_HOME: string;
	export const ANDROID_SDK_ROOT: string;
	export const APPDATA: string;
	export const ChocolateyInstall: string;
	export const ChocolateyLastPathUpdate: string;
	export const CLAUDECODE: string;
	export const CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: string;
	export const CLAUDE_CODE_SESSION_ID: string;
	export const CLAUDE_EFFORT: string;
	export const CLICKUP_API_KEY: string;
	export const CLOUDFLARE_API_TOKEN: string;
	export const COLORTERM: string;
	export const COMMONPROGRAMFILES: string;
	export const CommonProgramW6432: string;
	export const COMPUTERNAME: string;
	export const COMSPEC: string;
	export const COOLIFY_API_TOKEN: string;
	export const COOLIFY_URL: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const DATAFORSEO_LOGIN: string;
	export const DATAFORSEO_PASSWORD: string;
	export const DriverData: string;
	export const EFC_13364_1592913036: string;
	export const EFC_13364_4126798990: string;
	export const ENABLE_TOOL_SEARCH: string;
	export const EXEPATH: string;
	export const FIGMA_TOKEN: string;
	export const FIRECRAWL_API_KEY: string;
	export const FPS_BROWSER_APP_PROFILE_STRING: string;
	export const FPS_BROWSER_USER_PROFILE_STRING: string;
	export const GHL_APP_AGENCY_API_KEY: string;
	export const GHL_APP_API_KEY: string;
	export const GHL_CLIENT_ID: string;
	export const GHL_CLIENT_SECRET: string;
	export const GIT_EDITOR: string;
	export const GMAIL_AI_REFRESH_TOKEN: string;
	export const GMAIL_PERSONAL_REFRESH_TOKEN: string;
	export const GMAIL_REFRESH_TOKEN: string;
	export const GMAIL_SUPPORT_REFRESH_TOKEN: string;
	export const GODADDY_API_KEY: string;
	export const GODADDY_API_SECRET: string;
	export const GOOGLE_ADMIN_REFRESH_TOKEN: string;
	export const GOOGLE_ADS_MCP_API_KEY: string;
	export const GOOGLE_CLIENT_ID: string;
	export const GOOGLE_CLIENT_SECRET: string;
	export const GOOGLE_CONTACTS_REFRESH_TOKEN: string;
	export const GOOGLE_GSC_REFRESH_TOKEN: string;
	export const GOOGLE_PLACES_API_KEY: string;
	export const GOOGLE_REFRESH_TOKEN: string;
	export const HERMES_HOME: string;
	export const HOME: string;
	export const HOMEDRIVE: string;
	export const HOMEPATH: string;
	export const INIT_CWD: string;
	export const JAVA_HOME: string;
	export const LANG: string;
	export const LOCALAPPDATA: string;
	export const LOGONSERVER: string;
	export const MSYS: string;
	export const MSYSTEM: string;
	export const NDK_HOME: string;
	export const NGROK_API_KEY: string;
	export const NODE: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const NODE_PATH: string;
	export const npm_command: string;
	export const npm_config_auto_install_peers: string;
	export const npm_config_engine_strict: string;
	export const npm_config_frozen_lockfile: string;
	export const npm_config_link_workspace_packages: string;
	export const npm_config_prefer_workspace_packages: string;
	export const npm_config_registry: string;
	export const npm_config_resolution_mode: string;
	export const npm_config_save_workspace_protocol: string;
	export const npm_config_shared_workspace_lockfile: string;
	export const npm_config_user_agent: string;
	export const npm_config_verify_deps_before_run: string;
	export const npm_config__jsr_registry: string;
	export const npm_execpath: string;
	export const npm_lifecycle_event: string;
	export const npm_lifecycle_script: string;
	export const npm_node_execpath: string;
	export const npm_package_json: string;
	export const npm_package_name: string;
	export const npm_package_version: string;
	export const NUMBER_OF_PROCESSORS: string;
	export const NWScheduler: string;
	export const OLDPWD: string;
	export const OneDrive: string;
	export const OneDriveConsumer: string;
	export const OPENSSL_CONF: string;
	export const OPENSSL_INCLUDE_DIR: string;
	export const OPENSSL_LIB_DIR: string;
	export const OPENSSL_MODULES: string;
	export const OPENSSL_ROOT_DIR: string;
	export const OS: string;
	export const OTTOLAX_API_KEY: string;
	export const PATH: string;
	export const PATHEXT: string;
	export const PLINK_PROTOCOL: string;
	export const pnpm_config_verify_deps_before_run: string;
	export const PNPM_HOME: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const PROCESSOR_ARCHITECTURE: string;
	export const PROCESSOR_IDENTIFIER: string;
	export const PROCESSOR_LEVEL: string;
	export const PROCESSOR_REVISION: string;
	export const ProgramData: string;
	export const PROGRAMFILES: string;
	export const ProgramW6432: string;
	export const PROMPT: string;
	export const PSExecutionPolicyPreference: string;
	export const PSModulePath: string;
	export const PUBLIC: string;
	export const PWD: string;
	export const PYENV: string;
	export const PYENV_HOME: string;
	export const PYENV_ROOT: string;
	export const PYTHONUTF8: string;
	export const REMO_API_KEY: string;
	export const REMO_CLAUDE_INTERACTIVE_CONFIRMED: string;
	export const REMO_HUB_URL: string;
	export const REMO_PTY_INTERACTIVE: string;
	export const REPO_CONFINEMENT_OFF: string;
	export const REPO_ROOT: string;
	export const SESSIONNAME: string;
	export const SHELL: string;
	export const SHLVL: string;
	export const SYSTEMDRIVE: string;
	export const SYSTEMROOT: string;
	export const TELNYX_API_KEY: string;
	export const TEMP: string;
	export const TERM: string;
	export const TERM_PROGRAM: string;
	export const TMP: string;
	export const USERDOMAIN: string;
	export const USERDOMAIN_ROAMINGPROFILE: string;
	export const USERNAME: string;
	export const USERPROFILE: string;
	export const VBOX_HWVIRTEX_IGNORE_SVM_IN_USE: string;
	export const WAVETERM: string;
	export const WAVETERM_BLOCKID: string;
	export const WAVETERM_CLIENTID: string;
	export const WAVETERM_JWT: string;
	export const WAVETERM_TABID: string;
	export const WAVETERM_VERSION: string;
	export const WAVETERM_WORKSPACEID: string;
	export const WAVETERM_WSHBINDIR: string;
	export const WINDIR: string;
	export const WSH_BIN: string;
	export const _: string;
}

/**
 * Similar to [`$env/static/private`](https://kit.svelte.dev/docs/modules#$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/master/packages/adapter-node) (or running [`vite preview`](https://kit.svelte.dev/docs/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://kit.svelte.dev/docs/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		AI_AGENT: string;
		ALLUSERSPROFILE: string;
		AMDRMSDKPATH: string;
		ANDROID_HOME: string;
		ANDROID_SDK_ROOT: string;
		APPDATA: string;
		ChocolateyInstall: string;
		ChocolateyLastPathUpdate: string;
		CLAUDECODE: string;
		CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		CLAUDE_CODE_EXECPATH: string;
		CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: string;
		CLAUDE_CODE_SESSION_ID: string;
		CLAUDE_EFFORT: string;
		CLICKUP_API_KEY: string;
		CLOUDFLARE_API_TOKEN: string;
		COLORTERM: string;
		COMMONPROGRAMFILES: string;
		CommonProgramW6432: string;
		COMPUTERNAME: string;
		COMSPEC: string;
		COOLIFY_API_TOKEN: string;
		COOLIFY_URL: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		DATAFORSEO_LOGIN: string;
		DATAFORSEO_PASSWORD: string;
		DriverData: string;
		EFC_13364_1592913036: string;
		EFC_13364_4126798990: string;
		ENABLE_TOOL_SEARCH: string;
		EXEPATH: string;
		FIGMA_TOKEN: string;
		FIRECRAWL_API_KEY: string;
		FPS_BROWSER_APP_PROFILE_STRING: string;
		FPS_BROWSER_USER_PROFILE_STRING: string;
		GHL_APP_AGENCY_API_KEY: string;
		GHL_APP_API_KEY: string;
		GHL_CLIENT_ID: string;
		GHL_CLIENT_SECRET: string;
		GIT_EDITOR: string;
		GMAIL_AI_REFRESH_TOKEN: string;
		GMAIL_PERSONAL_REFRESH_TOKEN: string;
		GMAIL_REFRESH_TOKEN: string;
		GMAIL_SUPPORT_REFRESH_TOKEN: string;
		GODADDY_API_KEY: string;
		GODADDY_API_SECRET: string;
		GOOGLE_ADMIN_REFRESH_TOKEN: string;
		GOOGLE_ADS_MCP_API_KEY: string;
		GOOGLE_CLIENT_ID: string;
		GOOGLE_CLIENT_SECRET: string;
		GOOGLE_CONTACTS_REFRESH_TOKEN: string;
		GOOGLE_GSC_REFRESH_TOKEN: string;
		GOOGLE_PLACES_API_KEY: string;
		GOOGLE_REFRESH_TOKEN: string;
		HERMES_HOME: string;
		HOME: string;
		HOMEDRIVE: string;
		HOMEPATH: string;
		INIT_CWD: string;
		JAVA_HOME: string;
		LANG: string;
		LOCALAPPDATA: string;
		LOGONSERVER: string;
		MSYS: string;
		MSYSTEM: string;
		NDK_HOME: string;
		NGROK_API_KEY: string;
		NODE: string;
		NoDefaultCurrentDirectoryInExePath: string;
		NODE_PATH: string;
		npm_command: string;
		npm_config_auto_install_peers: string;
		npm_config_engine_strict: string;
		npm_config_frozen_lockfile: string;
		npm_config_link_workspace_packages: string;
		npm_config_prefer_workspace_packages: string;
		npm_config_registry: string;
		npm_config_resolution_mode: string;
		npm_config_save_workspace_protocol: string;
		npm_config_shared_workspace_lockfile: string;
		npm_config_user_agent: string;
		npm_config_verify_deps_before_run: string;
		npm_config__jsr_registry: string;
		npm_execpath: string;
		npm_lifecycle_event: string;
		npm_lifecycle_script: string;
		npm_node_execpath: string;
		npm_package_json: string;
		npm_package_name: string;
		npm_package_version: string;
		NUMBER_OF_PROCESSORS: string;
		NWScheduler: string;
		OLDPWD: string;
		OneDrive: string;
		OneDriveConsumer: string;
		OPENSSL_CONF: string;
		OPENSSL_INCLUDE_DIR: string;
		OPENSSL_LIB_DIR: string;
		OPENSSL_MODULES: string;
		OPENSSL_ROOT_DIR: string;
		OS: string;
		OTTOLAX_API_KEY: string;
		PATH: string;
		PATHEXT: string;
		PLINK_PROTOCOL: string;
		pnpm_config_verify_deps_before_run: string;
		PNPM_HOME: string;
		PNPM_SCRIPT_SRC_DIR: string;
		PROCESSOR_ARCHITECTURE: string;
		PROCESSOR_IDENTIFIER: string;
		PROCESSOR_LEVEL: string;
		PROCESSOR_REVISION: string;
		ProgramData: string;
		PROGRAMFILES: string;
		ProgramW6432: string;
		PROMPT: string;
		PSExecutionPolicyPreference: string;
		PSModulePath: string;
		PUBLIC: string;
		PWD: string;
		PYENV: string;
		PYENV_HOME: string;
		PYENV_ROOT: string;
		PYTHONUTF8: string;
		REMO_API_KEY: string;
		REMO_CLAUDE_INTERACTIVE_CONFIRMED: string;
		REMO_HUB_URL: string;
		REMO_PTY_INTERACTIVE: string;
		REPO_CONFINEMENT_OFF: string;
		REPO_ROOT: string;
		SESSIONNAME: string;
		SHELL: string;
		SHLVL: string;
		SYSTEMDRIVE: string;
		SYSTEMROOT: string;
		TELNYX_API_KEY: string;
		TEMP: string;
		TERM: string;
		TERM_PROGRAM: string;
		TMP: string;
		USERDOMAIN: string;
		USERDOMAIN_ROAMINGPROFILE: string;
		USERNAME: string;
		USERPROFILE: string;
		VBOX_HWVIRTEX_IGNORE_SVM_IN_USE: string;
		WAVETERM: string;
		WAVETERM_BLOCKID: string;
		WAVETERM_CLIENTID: string;
		WAVETERM_JWT: string;
		WAVETERM_TABID: string;
		WAVETERM_VERSION: string;
		WAVETERM_WORKSPACEID: string;
		WAVETERM_WSHBINDIR: string;
		WINDIR: string;
		WSH_BIN: string;
		_: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
