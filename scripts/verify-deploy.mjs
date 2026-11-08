#!/usr/bin/env node
/**
 * 部署校验——回答一个问题：线上跑的是不是 origin/main 这份代码。
 *
 * 为什么要有这个脚本：这个问题在今天之前只能靠手工查，而且第一次查就查错了。
 * 浏览器打开 https://dist-six-vert-70.vercel.app 得到的是连接超时（curl 报 HTTP 000），
 * 于是"线上挂了"看起来很像真的——实际是这台机器的 *.vercel.app 被解析到了
 * 69.63.178.13（Facebook 的地址，DNS 污染），站点本身好好的。要拿到真相得走三步：
 * 列项目最近部署、读部署的 meta.githubCommitSha、再从 HEAD 重新 export 一遍比对
 * bundle 哈希。三步都是手工的，就等于这三步迟早会被人跳过。
 *
 * 所以这里绕开站点域名、直接问 Vercel API，原因有两条：
 *   1. 站点域名正是会撒谎的那一层——DNS 污染、项目级 ssoProtection 挡在前面
 *      （那时生产环境返回的是 Vercel 自己的登录页）、Supabase 暂停导致的"Failed to fetch"，
 *      三种完全不同的故障在浏览器里长得一模一样，只有 API 分得清。
 *   2. 项目是 git 集成部署（main 一 push 就自动构建），所以"线上是哪个 commit"
 *      在 API 里是权威记录，不需要猜。
 *
 * 检查项：
 *   - origin/main 的最新 commit 与生产部署的 meta.githubCommitSha 是否相同（落后几个提交会说清）
 *   - 生产部署是否 READY（BUILDING / QUEUED 会明确提示"再等等"，而不是报成不一致）
 *   - 项目级 ssoProtection 是否为 null——不为 null 时所有人打开生产地址看到的都是
 *     Vercel 登录页，应用根本没上过线，这是本脚本能挡下的最贵的一种"看着正常"
 *   - 最新生产部署挂上了哪些别名（生产域名是不是真的指着它）
 *
 * 用法：
 *   npm run deploy:verify              # 查一次，不一致退出码 1
 *   npm run deploy:verify -- --wait    # push 之后用：最多等 300 秒，等线上追上来
 *   npm run deploy:verify -- --wait=600
 *
 * 令牌：读环境变量 VERCEL_TOKEN；没设就去 ~/.env 里找（AGENTS.md 记录了这个位置）。
 * 退出码：0 一致 / 1 不一致或配置有问题 / 2 令牌缺失（这一项不是代码的错，单独分开）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.vercel.com';
// dailystreak 项目。可以用 VERCEL_PROJECT_ID 覆盖，免得换项目时要改脚本。
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_fURFEaDvcwl9xE2ERBh8kKEPEIya';
const POLL_SECONDS = 10;

const argWait = process.argv.find((a) => a === '--wait' || a.startsWith('--wait='));
const WAIT_MS = argWait
  ? Number(argWait.split('=')[1] || 300) * 1000
  : 0;

const git = (args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const gitHas = (sha) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

function readToken() {
  if (process.env.VERCEL_TOKEN) return { token: process.env.VERCEL_TOKEN, from: '环境变量 VERCEL_TOKEN' };
  try {
    const envFile = readFileSync(path.join(os.homedir(), '.env'), 'utf8');
    const line = envFile.split('\n').find((l) => /^\s*VERCEL_TOKEN\s*=/.test(l));
    if (line) {
      const value = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      if (value) return { token: value, from: '~/.env' };
    }
  } catch {
    // 没有 ~/.env 就走下面的缺失分支
  }
  return null;
}

async function api(pathname) {
  const res = await fetch(API + pathname, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`${pathname} → ${msg}`);
  }
  return body;
}

const FOUND = readToken();
const TOKEN = (() => {
  const found = FOUND;
  if (!found) {
    console.error('找不到 VERCEL_TOKEN：不在环境变量里，也不在 ~/.env 里。');
    console.error('这个门禁要问 Vercel API 才能知道线上是哪个 commit，没有令牌就只能放弃，');
    console.error('而不是猜"应该差不多吧"。—— 补上令牌后重跑：npm run deploy:verify');
    process.exit(2);
  }
  return found.token;
})();

const TOKEN_SOURCE = FOUND.from;

const short = (sha) => (sha ? sha.slice(0, 7) : '(无)');
const when = (iso) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

async function snapshot() {
  const target = git(['rev-parse', 'origin/main']).trim();
  const head = git(['rev-parse', 'HEAD']);
  // 用解析出来的 sha 比较，而不是再写一遍 origin/main：少一次"两个地方各自解析"的机会。
  const unpushed = Number(git(['rev-list', '--count', `${target}..HEAD`]));

  const { deployments } = await api(`/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=10`);
  // 列表接口不带 alias，得再问一次单条部署，否则"域名指着谁"这一项永远是空的。
  const latest = deployments[0]
    ? await api(`/v13/deployments/${deployments[0].uid}`).catch(() => deployments[0])
    : null;
  const project = await api(`/v9/projects/${PROJECT_ID}`);

  return { target, head, unpushed, latest, project };
}

function report({ target, head, unpushed, latest, project }) {
  const problems = [];
  const lines = [];

  lines.push(`令牌来源：${TOKEN_SOURCE}`);
  lines.push(`origin/main：${short(target)}${unpushed ? `（本地领先 ${unpushed} 个提交，未 push）` : ''}`);

  if (!latest) {
    lines.push('生产部署：一个都没有');
    problems.push('这个项目没有任何生产部署，线上地址打不开是应该的。');
    return { problems, lines, ready: false, latest: null };
  }

  const sha = latest.meta?.githubCommitSha || '';
  lines.push(
    `生产部署：${short(sha)} ${latest.readyState} · ${when(latest.createdAt)} · ${latest.url}`,
  );
  if (Array.isArray(latest.alias) && latest.alias.length) {
    lines.push(`  别名：${latest.alias.join(', ')}`);
  } else {
    lines.push('  别名：无——部署好了但没有任何域名指过来');
    problems.push('最新生产部署没挂别名，说明域名指向的是旧的部署。');
  }

  // ssoProtection：不为 null 时生产地址返回 Vercel 登录页，应用等于没上线。
  const sso = project.ssoProtection;
  lines.push(`SSO 保护：${sso ? `开着（${JSON.stringify(sso)}）` : 'null（正常，外部可直接访问）'}`);
  if (sso) {
    problems.push('项目级 ssoProtection 不为 null：所有访客看到的是 Vercel 登录页，不是应用。');
  }

  if (latest.readyState !== 'READY') {
    lines.push(`  状态 ${latest.readyState}：还在构建/排队，先别下结论。`);
    return { problems, lines, ready: false, latest };
  }

  if (sha === target) {
    lines.push('结论：线上就是 origin/main 这份代码。');
  } else if (!sha) {
    problems.push('这个部署没有 meta.githubCommitSha，说明它不是从 git 构建的（手传的产物？），无法比对。');
  } else if (!gitHas(sha)) {
    problems.push(
      `线上跑的 ${short(sha)} 在本地仓库里不存在——有人 push 了本地没有的提交，或者历史被改写过。先 git fetch 再说。`,
    );
  } else {
    // 两个方向都要算：线上落后是"部署没跑"，线上超前是"本地 origin/main 是旧的，先 fetch"。
    // 只算一个方向时，反过来的情况会打印"落后 0 个提交"，那是自相矛盾的句子。
    const behind = Number(git(['rev-list', '--count', `${sha}..${target}`]));
    const ahead = Number(git(['rev-list', '--count', `${target}..${sha}`]));
    if (behind > 0) {
      problems.push(`线上落后 origin/main ${behind} 个提交（线上 ${short(sha)}，origin/main ${short(target)}）。`);
    } else if (ahead > 0) {
      problems.push(
        `线上比本地记录的 origin/main 还新 ${ahead} 个提交（线上 ${short(sha)}，本地 origin/main ${short(target)}）——先 git fetch。`,
      );
    } else {
      problems.push(`线上 ${short(sha)} 与 origin/main ${short(target)} 不一致，但数不出相差几个提交，需要人工看一下。`);
    }
  }

  if (unpushed) {
    problems.push(`本地还有 ${unpushed} 个提交没有 push，线上不可能包含它们。`);
  }

  return { problems, lines, ready: sha === target && latest.readyState === 'READY', latest };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const deadline = Date.now() + WAIT_MS;
  let state = report(await snapshot());

  while (WAIT_MS && !state.ready && Date.now() < deadline) {
    const left = Math.round((deadline - Date.now()) / 1000);
    const latest = state.latest ?? null;
    console.log(`线上还没追上（剩 ${left}s 重试）：${latest ? short(latest.meta?.githubCommitSha) + ' ' + latest.readyState : '无部署'}`);
    await sleep(POLL_SECONDS * 1000);
    state = report(await snapshot());
  }

  console.log(state.lines.join('\n'));

  if (state.problems.length) {
    console.error('\n' + state.problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`部署校验没能完成：${err.message}`);
  process.exit(1);
});
