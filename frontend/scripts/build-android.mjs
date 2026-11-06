// Build the FuelGo Android app (debug APK by default).
//   npm run android:build            -> ../android-release/FuelGo-debug.apk
//   npm run android:build -- release -> unsigned release APK (sign before publishing)
//
// Needs JDK 21 and the Android SDK. Uses JAVA_HOME / ANDROID_HOME when set, otherwise
// falls back to ~/android-tools/{jdk-21*,sdk} (where the setup in the README puts them).
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const variant = process.argv[2] === 'release' ? 'release' : 'debug'
const root = resolve(import.meta.dirname, '..')
const tools = join(homedir(), 'android-tools')

const javaHome = process.env.JAVA_HOME
  || (existsSync(tools) && readdirSync(tools).filter((d) => d.startsWith('jdk-21')).map((d) => join(tools, d))[0])
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(tools, 'sdk')
if (!javaHome || !existsSync(javaHome)) throw new Error('JDK 21 not found: set JAVA_HOME (see README "Android app").')
if (!existsSync(sdk)) throw new Error('Android SDK not found: set ANDROID_HOME (see README "Android app").')

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
  PATH: `${join(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
const run = (cmd, cwd = root) => {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd, env, stdio: 'inherit' })
}

// Gradle reads the SDK location from local.properties (git-ignored).
writeFileSync(join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`)

run('npx vite build --mode android')
run('npx cap sync android')
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew'
run(`${gradlew} assemble${variant === 'release' ? 'Release' : 'Debug'} --no-daemon`, join(root, 'android'))

const apkDir = join(root, 'android', 'app', 'build', 'outputs', 'apk', variant)
const apk = readdirSync(apkDir).find((f) => f.endsWith('.apk'))
const outDir = resolve(root, '..', 'android-release')
mkdirSync(outDir, { recursive: true })
const target = join(outDir, `FuelGo-${variant}.apk`)
copyFileSync(join(apkDir, apk), target)
console.log(`\nAPK ready: ${target}`)
