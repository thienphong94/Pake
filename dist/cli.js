#!/usr/bin/env node
import log from 'loglevel';
import chalk from 'chalk';
import updateNotifier from 'update-notifier';
import path from 'path';
import fsExtra from 'fs-extra';
import { fileURLToPath } from 'url';
import prompts from 'prompts';
import os from 'os';
import { execa, execaSync } from 'execa';
import crypto from 'crypto';
import ora from 'ora';
import fs from 'fs';
import fs$1 from 'fs/promises';
import { dir } from 'tmp-promise';
import { fileTypeFromBuffer } from 'file-type';
import icongen from 'icon-gen';
import sharp from 'sharp';
import * as psl from 'psl';
import { InvalidArgumentError, program as program$1, Option } from 'commander';

var name = "pake-cli";
var version = "3.15.6";
var description = "ðŸ¤±ðŸ» Turn any webpage into a desktop app with one command. ðŸ¤±ðŸ» ä¸€é”®æ‰“åŒ…ç½‘é¡µç”Ÿæˆè½»é‡æ¡Œé¢åº”ç”¨ã€‚";
var engines = {
	node: ">=20.0.0"
};
var packageManager = "pnpm@10.26.2";
var bin = {
	pake: "dist/cli.js"
};
var repository = {
	type: "git",
	url: "git+https://github.com/tw93/Pake.git"
};
var author = {
	name: "Tw93",
	email: "tw93@qq.com"
};
var keywords = [
	"pake",
	"pake-cli",
	"rust",
	"tauri",
	"no-electron",
	"productivity"
];
var files = [
	"LICENSE-EXCEPTION",
	"llms.txt",
	"dist/cli.js",
	"src-tauri"
];
var scripts = {
	start: "pnpm run dev",
	dev: "pnpm run tauri dev",
	build: "tauri build",
	"build:debug": "tauri build --debug",
	"build:mac": "tauri build --target universal-apple-darwin",
	analyze: "cd src-tauri && cargo bloat --release --crates",
	tauri: "tauri",
	cli: "cross-env NODE_ENV=development rollup -c -w",
	"cli:dev": "cross-env NODE_ENV=development rollup -c -w",
	"cli:build": "cross-env NODE_ENV=production rollup -c",
	test: "pnpm run cli:build && cross-env PAKE_CREATE_APP=1 node tests/index.js",
	format: "prettier --write . --ignore-unknown && find tests -name '*.js' -exec sed -i '' 's/[[:space:]]*$//' {} \\; && cd src-tauri && cargo fmt --verbose",
	"format:check": "prettier --check . --ignore-unknown",
	"release:check": "node scripts/check-release-version.mjs && pnpm run format:check && npx vitest run && pnpm run cli:build && npm pack --dry-run --ignore-scripts",
	update: "pnpm update --verbose && cd src-tauri && cargo update",
	prepublishOnly: "pnpm run cli:build"
};
var type = "module";
var exports$1 = "./dist/cli.js";
var license = "GPL-3.0-or-later";
var dependencies = {
	"@tauri-apps/api": "~2.10.1",
	"@tauri-apps/cli": "^2.10.0",
	chalk: "^5.6.2",
	commander: "^14.0.3",
	execa: "^9.6.1",
	"file-type": "^21.3.4",
	"fs-extra": "^11.3.3",
	"icon-gen": "^5.0.0",
	loglevel: "^1.9.2",
	ora: "^9.3.0",
	prompts: "^2.4.2",
	psl: "^1.15.0",
	sharp: "^0.35.0",
	"tmp-promise": "^3.0.3",
	"update-notifier": "^7.3.1"
};
var devDependencies = {
	"@rollup/plugin-alias": "^6.0.0",
	"@rollup/plugin-commonjs": "^29.0.0",
	"@rollup/plugin-json": "^6.1.0",
	"@rollup/plugin-replace": "^6.0.3",
	"@rollup/plugin-terser": "^0.4.4",
	"@types/fs-extra": "^11.0.4",
	"@types/node": "^25.3.2",
	"@types/prompts": "^2.4.9",
	"@types/tmp": "^0.2.6",
	"@types/update-notifier": "^6.0.8",
	"app-root-path": "^3.1.0",
	"cross-env": "^10.1.0",
	prettier: "^3.8.1",
	rollup: "^4.59.0",
	"rollup-plugin-typescript2": "^0.36.0",
	tslib: "^2.8.1",
	typescript: "^5.9.3",
	vitest: "^4.0.18"
};
var pnpm = {
	overrides: {
		sharp: "^0.35.0",
		"@img/sharp-libvips-darwin-arm64": "1.3.0",
		tmp: "0.2.7"
	},
	onlyBuiltDependencies: [
		"esbuild",
		"sharp"
	]
};
var packageJson = {
	name: name,
	version: version,
	description: description,
	engines: engines,
	packageManager: packageManager,
	bin: bin,
	repository: repository,
	author: author,
	keywords: keywords,
	files: files,
	scripts: scripts,
	type: type,
	exports: exports$1,
	license: license,
	dependencies: dependencies,
	devDependencies: devDependencies,
	pnpm: pnpm
};

// Convert the current module URL to a file path
const currentModulePath = fileURLToPath(import.meta.url);
// Resolve the parent directory of the current module
const npmDirectory = path.join(path.dirname(currentModulePath), '..');
const tauriConfigDirectory = path.join(npmDirectory, 'src-tauri', '.pake');

// Load configs from npm package directory, not from project source
const tauriSrcDir = path.join(npmDirectory, 'src-tauri');
const pakeConf = fsExtra.readJSONSync(path.join(tauriSrcDir, 'pake.json'));
const CommonConf = fsExtra.readJSONSync(path.join(tauriSrcDir, 'tauri.conf.json'));
const WinConf = fsExtra.readJSONSync(path.join(tauriSrcDir, 'tauri.windows.conf.json'));
const MacConf = fsExtra.readJSONSync(path.join(tauriSrcDir, 'tauri.macos.conf.json'));
const LinuxConf = fsExtra.readJSONSync(path.join(tauriSrcDir, 'tauri.linux.conf.json'));
const platformConfigs = {
    win32: WinConf,
    darwin: MacConf,
    linux: LinuxConf,
};
const { platform: platform$2 } = process;
// @ts-ignore
const platformConfig = platformConfigs[platform$2];
let tauriConfig = {
    ...CommonConf,
    bundle: platformConfig.bundle,
    app: {
        ...CommonConf.app,
        trayIcon: {
            ...(platformConfig?.app?.trayIcon ?? {}),
        },
    },
    build: CommonConf.build,
    pake: pakeConf,
};

// Stable exit-code contract: 0 success, 2 invalid input, 3 build/network
// failure, 4 missing environment, 1 unexpected. Documented in cli-usage docs.
const ERROR_EXIT_CODES = {
    INVALID_INPUT: 2,
    BUILD_FAILED: 3,
    NETWORK: 3,
    ENV_MISSING: 4,
    UNEXPECTED: 1,
};
let machineMode = false;
const capturedWarnings = [];
/**
 * Route all loglevel output to stderr, capture warnings for the final JSON
 * result, and strip ANSI colors. Must be called before any logging happens.
 */
function enableMachineMode() {
    if (machineMode)
        return;
    machineMode = true;
    chalk.level = 0;
    log.methodFactory = (methodName) => {
        return (...args) => {
            if (methodName === 'warn') {
                capturedWarnings.push(args.map(String).join(' '));
            }
            console.error(...args);
        };
    };
    // Rebuild logging methods with the new factory.
    log.setLevel(log.getLevel());
}
function isMachineMode() {
    return machineMode;
}
function getCapturedWarnings() {
    return [...capturedWarnings];
}
/**
 * Whether Pake may prompt the user. False in machine mode, without a TTY,
 * or inside CI, where prompts would hang or produce garbage.
 */
function isInteractive() {
    return (!machineMode &&
        Boolean(process.stdin.isTTY) &&
        Boolean(process.stdout.isTTY) &&
        !process.env.CI &&
        !process.env.GITHUB_ACTIONS);
}
function printJsonResult(result) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

// Generates a stable identifier based on the app URL (and optionally name).
// When name is provided it is included in the hash so two apps wrapping
// the same URL can coexist. Omitting name preserves backward compatibility
// with identifiers generated before V3.10.1.
function getIdentifier(url, name) {
    const hashInput = name ? `${url}::${name}` : url;
    const postFixHash = crypto
        .createHash('md5')
        .update(hashInput)
        .digest('hex')
        .substring(0, 6);
    return `com.pake.a${postFixHash}`;
}
function resolveIdentifier(url, explicitName, customIdentifier) {
    const trimmedIdentifier = customIdentifier?.trim();
    if (trimmedIdentifier) {
        if (!/^[a-zA-Z][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(trimmedIdentifier)) {
            throw new Error(`Invalid identifier "${trimmedIdentifier}". Must start with a letter, ` +
                `contain only letters, digits, hyphens, and dots, and end with a letter or digit.`);
        }
        return trimmedIdentifier;
    }
    return getIdentifier(url, explicitName);
}
async function promptText(message, initial) {
    const response = await prompts({
        type: 'text',
        name: 'content',
        message,
        initial,
    });
    return response.content;
}
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
function getSpinner(text) {
    const loadingType = {
        interval: 80,
        frames: ['âœ¦', 'âœ¶', 'âœº', 'âœµ', 'âœ¸', 'âœ¹', 'âœº'],
    };
    return ora({
        text: `${chalk.cyan(text)}\n`,
        spinner: loadingType,
        color: 'cyan',
        // In machine mode stdout must stay parseable and stderr low-noise.
        isSilent: isMachineMode(),
    }).start();
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const CN_MIRROR_ENV = 'PAKE_USE_CN_MIRROR';
function isCnMirrorEnabled(value = process.env[CN_MIRROR_ENV]) {
    return TRUE_VALUES.has((value ?? '').trim().toLowerCase());
}

const { platform: platform$1 } = process;
const IS_MAC = platform$1 === 'darwin';
const IS_WIN = platform$1 === 'win32';
const IS_LINUX = platform$1 === 'linux';
// Distro IDs / ID_LIKE families that ship an RPM-based package manager.
const RPM_FAMILY_IDS = new Set([
    'rhel',
    'fedora',
    'centos',
    'rocky',
    'almalinux',
    'ol', // Oracle Linux
    'oracle',
    'amzn', // Amazon Linux
    'mariner',
    'azurelinux',
    'suse',
    'opensuse',
    'opensuse-leap',
    'opensuse-tumbleweed',
    'sles',
]);
// Distro IDs / ID_LIKE families that ship a DEB-based package manager.
const DEB_FAMILY_IDS = new Set([
    'debian',
    'ubuntu',
    'linuxmint',
    'pop',
    'elementary',
    'kali',
    'raspbian',
    'devuan',
]);
// Parse the shell-style key=value pairs of an /etc/os-release file, stripping
// the optional surrounding quotes around values.
function parseOsRelease(content) {
    const fields = {};
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;
        const separator = line.indexOf('=');
        if (separator === -1)
            continue;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))) {
            value = value.slice(1, -1);
        }
        if (key)
            fields[key] = value;
    }
    return fields;
}
// Detect the package family from /etc/os-release. The distro's own ID wins over
// ID_LIKE hints, and an unknown distro falls back to 'deb' to preserve Pake's
// historical default. Accepts content directly so the decision is unit-testable
// without a real /etc/os-release.
function detectLinuxPackageFamily(osReleaseContent) {
    let content = osReleaseContent;
    if (content === undefined) {
        try {
            content = fs.readFileSync('/etc/os-release', 'utf-8');
        }
        catch {
            return 'deb';
        }
    }
    const fields = parseOsRelease(content);
    const id = (fields.ID ?? '').toLowerCase().trim();
    const idLike = (fields.ID_LIKE ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    for (const token of [id, ...idLike]) {
        if (DEB_FAMILY_IDS.has(token))
            return 'deb';
        if (RPM_FAMILY_IDS.has(token))
            return 'rpm';
    }
    return 'deb';
}
// Default Linux bundle targets, chosen by the host distro's package family so
// RPM-based distros (Fedora/RHEL/Oracle/Rocky/Alma/openSUSE) get a native .rpm
// instead of a .deb their package manager cannot install. AppImage stays as a
// universal fallback in both cases.
function getDefaultLinuxTargets() {
    return detectLinuxPackageFamily() === 'rpm' ? 'rpm,appimage' : 'deb,appimage';
}

async function shellExec(command, timeout = 300000, env) {
    try {
        const { exitCode } = await execa(command, {
            cwd: npmDirectory,
            // Use 'inherit' to show all output directly to user in real-time.
            // This ensures linuxdeploy and other tool outputs are visible during builds.
            // In machine mode (--json) stdout is reserved for the final JSON result,
            // so subprocess stdout is rerouted to stderr instead.
            stdin: 'inherit',
            stdout: isMachineMode() ? process.stderr : 'inherit',
            stderr: 'inherit',
            shell: true,
            timeout,
            env: env ? { ...process.env, ...env } : process.env,
        });
        return exitCode;
    }
    catch (error) {
        const exitCode = error.exitCode ?? 'unknown';
        const errorMessage = error.message || 'Unknown error occurred';
        if (error.timedOut) {
            throw new Error(`Command timed out after ${timeout}ms: "${command}". Try increasing timeout or check network connectivity.`);
        }
        // AppImage/linuxdeploy guidance is added by the caller (BaseBuilder), which
        // knows the build target. We only have the command line here (the tool's
        // diagnostics stream to the terminal via stdio:inherit, not into the error).
        throw new Error(`Error occurred while executing command "${command}". Exit code: ${exitCode}. Details: ${errorMessage}`);
    }
}

function normalizePathForComparison(targetPath) {
    const normalized = path.normalize(targetPath);
    return IS_WIN ? normalized.toLowerCase() : normalized;
}
function getCargoHomeCandidates() {
    const candidates = new Set();
    if (process.env.CARGO_HOME) {
        candidates.add(process.env.CARGO_HOME);
    }
    const homeDir = os.homedir();
    if (homeDir) {
        candidates.add(path.join(homeDir, '.cargo'));
    }
    if (IS_WIN && process.env.USERPROFILE) {
        candidates.add(path.join(process.env.USERPROFILE, '.cargo'));
    }
    return Array.from(candidates).filter(Boolean);
}
function ensureCargoBinOnPath() {
    const currentPath = process.env.PATH || '';
    const segments = currentPath.split(path.delimiter).filter(Boolean);
    const normalizedSegments = new Set(segments.map((segment) => normalizePathForComparison(segment)));
    const additions = [];
    let cargoHomeSet = Boolean(process.env.CARGO_HOME);
    for (const cargoHome of getCargoHomeCandidates()) {
        const binDir = path.join(cargoHome, 'bin');
        if (fsExtra.pathExistsSync(binDir) &&
            !normalizedSegments.has(normalizePathForComparison(binDir))) {
            additions.push(binDir);
            normalizedSegments.add(normalizePathForComparison(binDir));
        }
        if (!cargoHomeSet && fsExtra.pathExistsSync(cargoHome)) {
            process.env.CARGO_HOME = cargoHome;
            cargoHomeSet = true;
        }
    }
    if (additions.length) {
        const prefix = additions.join(path.delimiter);
        process.env.PATH = segments.length
            ? `${prefix}${path.delimiter}${segments.join(path.delimiter)}`
            : prefix;
    }
}
function ensureRustEnv() {
    ensureCargoBinOnPath();
}
async function installRust() {
    const rustInstallScriptForUnix = isCnMirrorEnabled()
        ? 'export RUSTUP_DIST_SERVER="https://rsproxy.cn" && export RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup" && curl --proto "=https" --tlsv1.2 -sSf https://rsproxy.cn/rustup-init.sh | sh'
        : "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y";
    const rustInstallScriptForWindows = 'winget install --id Rustlang.Rustup';
    const spinner = getSpinner('Downloading Rust...');
    try {
        await shellExec(IS_WIN ? rustInstallScriptForWindows : rustInstallScriptForUnix, 300000, undefined);
        spinner.succeed(chalk.green('âœ” Rust installed successfully!'));
        ensureRustEnv();
    }
    catch (error) {
        spinner.fail(chalk.red('âœ• Rust installation failed!'));
        if (error instanceof Error) {
            console.error(error.message);
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
function checkRustInstalled() {
    ensureCargoBinOnPath();
    try {
        execaSync('rustc', ['--version']);
        return true;
    }
    catch {
        return false;
    }
}

async function combineFiles(files, output) {
    const contents = await Promise.all(files.map(async (file) => {
        if (file.endsWith('.css')) {
            const fileContent = await fs$1.readFile(file, 'utf-8');
            return `window.addEventListener('DOMContentLoaded', (_event) => {
        const css = ${JSON.stringify(fileContent)};
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      });`;
        }
        const fileContent = await fs$1.readFile(file);
        // Keep the closing `});` on its own line. If the injected file ends in a
        // line comment without a trailing newline, appending ` });` on the same
        // line would comment it out and break the wrapper (mirrors the .css
        // branch above, which already closes on a separate line).
        return ("window.addEventListener('DOMContentLoaded', (_event) => {\n" +
            fileContent +
            '\n});');
    }));
    await fs$1.writeFile(output, contents.join('\n'));
    return files;
}

const logger = {
    info(...msg) {
        log.info(...msg.map((m) => chalk.white(m)));
    },
    debug(...msg) {
        log.debug(...msg);
    },
    error(...msg) {
        log.error(...msg.map((m) => chalk.red(m)));
    },
    warn(...msg) {
        log.warn(...msg.map((m) => chalk.yellow(m)));
    },
    success(...msg) {
        log.info(...msg.map((m) => chalk.green(m)));
    },
};

function generateSafeFilename(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/\.+$/g, '')
        .slice(0, 255);
}
function getSafeAppName(name) {
    return generateSafeFilename(name).toLowerCase();
}
function generateLinuxPackageName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}
function generateIdentifierSafeName(name) {
    const cleaned = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '').toLowerCase();
    if (cleaned === '') {
        const fallback = Array.from(name)
            .map((char) => {
            const code = char.charCodeAt(0);
            if ((code >= 48 && code <= 57) ||
                (code >= 65 && code <= 90) ||
                (code >= 97 && code <= 122)) {
                return char.toLowerCase();
            }
            return code.toString(16);
        })
            .join('')
            .slice(0, 50);
        return fallback || 'pake-app';
    }
    return cleaned;
}

/**
 * Error class used for user-facing CLI errors.
 *
 * The top-level catch in `bin/cli.ts` prints `message` directly without a
 * stack trace and exits with the code mapped from `code` (see
 * ERROR_EXIT_CODES in utils/output.ts). Use this for predictable failures
 * (invalid names, missing files, etc.) so users see a clean message instead
 * of a Node.js stack dump. `code` and `hint` also feed the `--json` result.
 */
class PakeError extends Error {
    constructor(message, options) {
        super(message);
        this.isUserError = true;
        this.name = 'PakeError';
        this.code = options?.code;
        this.hint = options?.hint;
    }
}
function isPakeError(error) {
    return (error instanceof PakeError ||
        (typeof error === 'object' &&
            error !== null &&
            error.isUserError === true));
}

const LINUX_TARGET_TYPES = ['deb', 'appimage', 'rpm', 'zst'];
// Returns the valid Linux build targets from a comma-separated targets
// string, preserving LINUX_TARGET_TYPES order. Unknown entries are dropped.
function filterLinuxTargets(targets) {
    const requested = targets.split(',').map((target) => target.trim());
    return LINUX_TARGET_TYPES.filter((target) => requested.includes(target));
}
function needsTemporaryDebForZst(targets) {
    return targets.includes('zst') && !targets.includes('deb');
}
/…24566 tokens truncated…n)
        .option('--width <number>', 'Window width', validateNumberInput, DEFAULT_PAKE_OPTIONS.width)
        .option('--height <number>', 'Window height', validateNumberInput, DEFAULT_PAKE_OPTIONS.height)
        .option('--use-local-file', 'Use local file packaging', DEFAULT_PAKE_OPTIONS.useLocalFile)
        .option('--fullscreen', 'Start in full screen', DEFAULT_PAKE_OPTIONS.fullscreen)
        .option('--hide-title-bar', 'For Mac, hide title bar', DEFAULT_PAKE_OPTIONS.hideTitleBar)
        .option('--hide-window-decorations', 'Hide native window decorations on Windows and Linux', DEFAULT_PAKE_OPTIONS.hideWindowDecorations)
        .option('--multi-arch', 'For Mac, both Intel and M1', DEFAULT_PAKE_OPTIONS.multiArch)
        .option('--inject <files>', 'Inject local CSS/JS files into the page', (val, previous) => {
        if (!val)
            return DEFAULT_PAKE_OPTIONS.inject;
        // Split by comma and trim whitespace, filter out empty strings
        const files = val
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        // If previous values exist (from multiple --inject options), merge them
        return previous ? [...previous, ...files] : files;
    }, DEFAULT_PAKE_OPTIONS.inject)
        .option('--debug', 'Debug build and more output', DEFAULT_PAKE_OPTIONS.debug)
        .option('--json', 'Machine-readable output: logs to stderr, one JSON result on stdout', DEFAULT_PAKE_OPTIONS.json)
        .option('--config <path>', 'Load options from a JSON config file (fields mirror CLI options, see schema/pake.schema.json)')
        .addOption(new Option('--proxy-url <url>', 'Proxy URL for all network requests (http://, https://, socks5://)')
        .default(DEFAULT_PAKE_OPTIONS.proxyUrl)
        .hideHelp())
        .addOption(new Option('--user-agent <string>', 'Custom user agent')
        .default(DEFAULT_PAKE_OPTIONS.userAgent)
        .hideHelp())
        .addOption(new Option('--targets <string>', 'Build target format for your system').default(DEFAULT_PAKE_OPTIONS.targets))
        .addOption(new Option('--app-version <string>', 'App version, the same as package.json version')
        .default(DEFAULT_PAKE_OPTIONS.appVersion)
        .hideHelp())
        .addOption(new Option('--always-on-top', 'Always on the top level')
        .default(DEFAULT_PAKE_OPTIONS.alwaysOnTop)
        .hideHelp())
        .addOption(new Option('--maximize', 'Start window maximized')
        .default(DEFAULT_PAKE_OPTIONS.maximize)
        .hideHelp())
        .addOption(new Option('--dark-mode', 'Force app to use dark mode (supports macOS, Windows, and Linux)')
        .default(DEFAULT_PAKE_OPTIONS.darkMode)
        .hideHelp())
        .addOption(new Option('--disabled-web-shortcuts', 'Disabled webPage shortcuts')
        .default(DEFAULT_PAKE_OPTIONS.disabledWebShortcuts)
        .hideHelp())
        .addOption(new Option('--activation-shortcut <string>', 'Shortcut key to active App')
        .default(DEFAULT_PAKE_OPTIONS.activationShortcut)
        .hideHelp())
        .addOption(new Option('--show-system-tray', 'Show system tray in app')
        .default(DEFAULT_PAKE_OPTIONS.showSystemTray)
        .hideHelp())
        .addOption(new Option('--system-tray-icon <string>', 'Custom system tray icon')
        .default(DEFAULT_PAKE_OPTIONS.systemTrayIcon)
        .hideHelp())
        .addOption(new Option('--hide-on-close [boolean]', 'Hide window on close instead of exiting (default: true for macOS, false for others)')
        .default(DEFAULT_PAKE_OPTIONS.hideOnClose)
        .argParser((value) => {
        if (value === undefined)
            return true; // --hide-on-close without value
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        throw new Error('--hide-on-close must be true or false');
    })
        .hideHelp())
        .addOption(new Option('--title <string>', 'Window title').hideHelp())
        .addOption(new Option('--incognito', 'Launch app in incognito/private mode')
        .default(DEFAULT_PAKE_OPTIONS.incognito)
        .hideHelp())
        .addOption(new Option('--wasm', 'Enable WebAssembly support (Flutter Web, etc.)')
        .default(DEFAULT_PAKE_OPTIONS.wasm)
        .hideHelp())
        .addOption(new Option('--enable-drag-drop', 'Enable drag and drop functionality')
        .default(DEFAULT_PAKE_OPTIONS.enableDragDrop)
        .hideHelp())
        .addOption(new Option('--keep-binary', 'Keep raw binary file alongside installer')
        .default(DEFAULT_PAKE_OPTIONS.keepBinary)
        .hideHelp())
        .addOption(new Option('--no-bundle', 'Skip packaging, output only the raw executable (Linux; for RPM distros where the bundler aborts)')
        .default(DEFAULT_PAKE_OPTIONS.bundle)
        .hideHelp())
        .addOption(new Option('--multi-instance', 'Allow multiple app instances')
        .default(DEFAULT_PAKE_OPTIONS.multiInstance)
        .hideHelp())
        .addOption(new Option('--multi-window', 'Allow opening multiple windows within one app instance')
        .default(DEFAULT_PAKE_OPTIONS.multiWindow)
        .hideHelp())
        .addOption(new Option('--start-to-tray', 'Start app minimized to tray')
        .default(DEFAULT_PAKE_OPTIONS.startToTray)
        .hideHelp())
        .addOption(new Option('--force-internal-navigation', 'Keep every link inside the Pake window instead of opening external handlers').default(DEFAULT_PAKE_OPTIONS.forceInternalNavigation))
        .addOption(new Option('--internal-url-regex <string>', 'Regex pattern to match URLs that should be considered internal').default(DEFAULT_PAKE_OPTIONS.internalUrlRegex))
        .addOption(new Option('--safe-domain <domains>', 'Comma-separated domains kept inside the app (e.g. SSO/workspace callbacks)').default(DEFAULT_PAKE_OPTIONS.safeDomain))
        .addOption(new Option('--enable-find', 'Enable in-page Find UI with Cmd/Ctrl+F/G shortcuts')
        .default(DEFAULT_PAKE_OPTIONS.enableFind)
        .hideHelp())
        .addOption(new Option('--installer-language <string>', 'Installer language')
        .default(DEFAULT_PAKE_OPTIONS.installerLanguage)
        .hideHelp())
        .addOption(new Option('--zoom <number>', 'Initial page zoom level (50-200)')
        .default(DEFAULT_PAKE_OPTIONS.zoom)
        .argParser((value) => {
        const zoom = Number(value);
        if (!Number.isInteger(zoom) || zoom < 50 || zoom > 200) {
            throw new Error('--zoom must be an integer between 50 and 200');
        }
        return zoom;
    })
        .hideHelp())
        .addOption(new Option('--min-width <number>', 'Minimum window width')
        .default(DEFAULT_PAKE_OPTIONS.minWidth)
        .argParser(validateNumberInput)
        .hideHelp())
        .addOption(new Option('--min-height <number>', 'Minimum window height')
        .default(DEFAULT_PAKE_OPTIONS.minHeight)
        .argParser(validateNumberInput)
        .hideHelp())
        .addOption(new Option('--ignore-certificate-errors', 'Ignore certificate errors (for self-signed certificates)')
        .default(DEFAULT_PAKE_OPTIONS.ignoreCertificateErrors)
        .hideHelp())
        .addOption(new Option('--iterative-build', 'Turn on rapid build mode (app only, no dmg/deb/msi), good for debugging')
        .default(DEFAULT_PAKE_OPTIONS.iterativeBuild)
        .hideHelp())
        .addOption(new Option('--new-window', 'Allow sites to open new windows (for auth flows, tabs, branches)').default(DEFAULT_PAKE_OPTIONS.newWindow))
        .addOption(new Option('--install', 'Auto-install app to /Applications (macOS) after build and remove local bundle')
        .default(DEFAULT_PAKE_OPTIONS.install)
        .hideHelp())
        .addOption(new Option('--camera', 'Request camera permission on macOS')
        .default(DEFAULT_PAKE_OPTIONS.camera)
        .hideHelp())
        .addOption(new Option('--microphone', 'Request microphone permission on macOS')
        .default(DEFAULT_PAKE_OPTIONS.microphone)
        .hideHelp())
        .version(packageJson.version, '-v, --version')
        .configureHelp({
        sortSubcommands: true,
        visibleOptions: (command) => {
            const options = [...command.options];
            const helpOption = command
                ._helpOption;
            if (helpOption) {
                options.push(helpOption);
            }
            return options;
        },
        optionTerm: (option) => {
            return option.flags;
        },
        optionDescription: (option) => {
            return option.description;
        },
    });
}

// Invocation concerns, not app manifest fields; pass these as CLI flags.
const REJECTED_KEYS = new Set(['config', 'json', 'version']);
// Optional CLI options that have no entry in DEFAULT_PAKE_OPTIONS.
const EXTRA_STRING_KEYS = new Set(['name', 'title', 'identifier']);
// Numeric fields share the CLI flag ranges (see cli-program.ts validators),
// so a config file cannot smuggle a value the same flag would reject.
const NUMBER_RANGES = {
    width: { min: 0 },
    height: { min: 0 },
    minWidth: { min: 0 },
    minHeight: { min: 0 },
    zoom: { min: 50, max: 200 },
};
function expectedTypeFor(key) {
    if (key === 'inject')
        return 'string[]';
    if (key === 'hideOnClose')
        return 'boolean';
    if (EXTRA_STRING_KEYS.has(key))
        return 'string';
    const defaultValue = DEFAULT_PAKE_OPTIONS[key];
    const type = typeof defaultValue;
    if (type === 'string' || type === 'number' || type === 'boolean') {
        return type;
    }
    return null;
}
function matchesType(value, type) {
    if (type === 'string[]') {
        return Array.isArray(value) && value.every((v) => typeof v === 'string');
    }
    return typeof value === type;
}
async function loadConfigFile(configPath, validKeys) {
    if (!(await fsExtra.pathExists(configPath))) {
        throw new PakeError(`Config file not found: ${configPath}`, {
            code: 'INVALID_INPUT',
            hint: 'Pass a path to a JSON file matching schema/pake.schema.json.',
        });
    }
    let parsed;
    try {
        parsed = JSON.parse(await fsExtra.readFile(configPath, 'utf8'));
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new PakeError(`Config file is not valid JSON: ${detail}`, {
            code: 'INVALID_INPUT',
            hint: `Fix the JSON syntax in ${configPath}.`,
        });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new PakeError('Config file must contain a JSON object.', {
            code: 'INVALID_INPUT',
            hint: 'See schema/pake.schema.json for the expected shape.',
        });
    }
    const result = { options: {} };
    for (const [key, value] of Object.entries(parsed)) {
        if (key === '$schema')
            continue;
        if (key === 'url') {
            if (typeof value !== 'string') {
                throw new PakeError('Config field "url" must be a string.', {
                    code: 'INVALID_INPUT',
                    hint: 'Use a web URL or a local file/directory path.',
                });
            }
            result.url = value;
            continue;
        }
        if (REJECTED_KEYS.has(key)) {
            throw new PakeError(`Config field "${key}" is not allowed in a config file.`, {
                code: 'INVALID_INPUT',
                hint: `Pass --${key} on the command line instead.`,
            });
        }
        if (!validKeys.has(key)) {
            throw new PakeError(`Unknown config field "${key}".`, {
                code: 'INVALID_INPUT',
                hint: 'Field names are camelCase CLI option names; see schema/pake.schema.json.',
            });
        }
        const expected = expectedTypeFor(key);
        if (expected && !matchesType(value, expected)) {
            throw new PakeError(`Config field "${key}" must be of type ${expected}.`, {
                code: 'INVALID_INPUT',
                hint: 'See schema/pake.schema.json for field types.',
            });
        }
        if (typeof value === 'number') {
            const range = NUMBER_RANGES[key];
            const min = range?.min ?? 0;
            const max = range?.max;
            if (!Number.isFinite(value) ||
                value < min ||
                (max !== undefined && value > max)) {
                const bounds = max !== undefined ? `${min}-${max}` : `>= ${min}`;
                throw new PakeError(`Config field "${key}" must be a finite number (${bounds}).`, {
                    code: 'INVALID_INPUT',
                    hint: 'See schema/pake.schema.json for field ranges.',
                });
            }
        }
        if (!expected && (typeof value === 'object' || value === null)) {
            throw new PakeError(`Config field "${key}" must be a string, number, or boolean.`, {
                code: 'INVALID_INPUT',
                hint: 'See schema/pake.schema.json for field types.',
            });
        }
        result.options[key] = value;
    }
    return result;
}

const program = getCliProgram();
// Make commander throw instead of exiting so option/argument parse errors
// honor the exit-code contract (2 = invalid input) and still emit the JSON
// result object when --json was requested.
program.exitOverride();
function isCommanderExit(error) {
    return (typeof error === 'object' &&
        error !== null &&
        typeof error.code === 'string' &&
        error.code.startsWith('commander.'));
}
const PHASE_ERROR_CODES = {
    input: 'INVALID_INPUT',
    prepare: 'ENV_MISSING',
    build: 'BUILD_FAILED',
};
function classifyError(error, phase) {
    if (isPakeError(error)) {
        return {
            code: error.code ?? PHASE_ERROR_CODES[phase],
            message: error.message,
            hint: error.hint ?? null,
        };
    }
    if (error instanceof Error) {
        return {
            code: PHASE_ERROR_CODES[phase],
            message: error.message,
            hint: null,
        };
    }
    return {
        code: 'UNEXPECTED',
        message: `Unexpected error: ${String(error)}`,
        hint: null,
    };
}
async function checkUpdateTips() {
    updateNotifier({ pkg: packageJson, updateCheckInterval: 1000 * 60 }).notify({
        isGlobal: true,
    });
}
program.action(async (urlArg, options) => {
    const jsonMode = Boolean(options.json);
    if (jsonMode) {
        enableMachineMode();
    }
    let phase = 'input';
    let appName = null;
    let url = urlArg;
    try {
        // Heal a dist_bak stranded by an earlier crashed local-input run before
        // building, or this build would embed that run's staged files.
        restoreLocalTree();
        if (!jsonMode) {
            await checkUpdateTips();
        }
        // Config file fills in whatever the command line did not set explicitly:
        // CLI flag > config field > built-in default.
        if (options.config) {
            const validKeys = new Set(program.options.map((option) => option.attributeName()));
            const loaded = await loadConfigFile(options.config, validKeys);
            for (const [key, value] of Object.entries(loaded.options)) {
                if (program.getOptionValueSource(key) !== 'cli') {
                    options[key] = value;
                }
            }
            if (!url && loaded.url) {
                try {
                    url = validateUrlInput(loaded.url);
                }
                catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    throw new PakeError(`Invalid "url" in config file: ${detail}`, {
                        code: 'INVALID_INPUT',
                    });
                }
            }
        }
        if (!url) {
            if (jsonMode) {
                throw new PakeError('No URL or local path to package.', {
                    code: 'INVALID_INPUT',
                    hint: 'Pass a URL/path argument or a config file with a "url" field.',
                });
            }
            program.help({
                error: false,
            });
            return;
        }
        log.setDefaultLevel('info');
        log.setLevel('info');
        if (options.debug) {
            log.setLevel('debug');
        }
        const appOptions = await handleOptions(options, url);
        appName = appOptions.name ?? null;
        const builder = BuilderProvider.create(appOptions);
        phase = 'prepare';
        await builder.prepare();
        phase = 'build';
        await builder.build(url);
        if (jsonMode) {
            printJsonResult({
                ok: true,
                name: appName,
                platform: process.platform,
                arch: builder.getReportArch(),
                outputs: builder.getArtifacts(),
                warnings: getCapturedWarnings(),
                error: null,
            });
        }
    }
    catch (error) {
        // program.help() and --help/--version throw under exitOverride with
        // exitCode 0; a clean commander exit is not a failure.
        if (isCommanderExit(error) && error.exitCode === 0) {
            return;
        }
        const classified = classifyError(error, phase);
        if (jsonMode) {
            printJsonResult({
                ok: false,
                name: appName,
                platform: process.platform,
                arch: null,
                outputs: [],
                warnings: getCapturedWarnings(),
                error: classified,
            });
        }
        else if (isPakeError(error)) {
            console.error(chalk.red(classified.message));
            if (classified.hint) {
                console.error(chalk.yellow(`âœ¼ ${classified.hint}`));
            }
        }
        else if (error instanceof Error) {
            console.error(chalk.red(`âœ• ${error.message}`));
            if (options?.debug && error.stack) {
                console.error(chalk.gray(error.stack));
            }
        }
        else {
            console.error(chalk.red(`âœ• Unexpected error: ${String(error)}`));
        }
        // exitCode + natural exit instead of process.exit: lets the finally
        // restore run and guarantees the JSON result is flushed on piped stdout.
        process.exitCode = ERROR_EXIT_CODES[classified.code];
    }
    finally {
        // A local-input run replaces the package's own dist/ during staging; put
        // it back so the CLI stays intact and later builds cannot embed this
        // user's files.
        restoreLocalTree();
    }
});
program.parseAsync().catch((error) => {
    if (isCommanderExit(error)) {
        // --help / --version and friends exit clean; commander already printed.
        if (error.exitCode === 0) {
            return;
        }
        // Parse errors (unknown option, invalid argument, missing value) are
        // invalid input. Commander already printed the message to stderr; in
        // json mode also emit the machine-readable result on stdout.
        if (process.argv.includes('--json')) {
            printJsonResult({
                ok: false,
                name: null,
                platform: process.platform,
                arch: null,
                outputs: [],
                warnings: [],
                error: {
                    code: 'INVALID_INPUT',
                    message: error.message.trim(),
                    hint: 'Run pake --help for the accepted options.',
                },
            });
        }
        process.exitCode = ERROR_EXIT_CODES.INVALID_INPUT;
        return;
    }
    if (error instanceof Error) {
        console.error(chalk.red(`âœ• ${error.message}`));
    }
    else {
        console.error(chalk.red(`âœ• Unexpected error: ${String(error)}`));
    }
    process.exitCode = 1;
});

