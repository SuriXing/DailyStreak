#!/usr/bin/env node
/**
 * 部署校验——分清三件不同的事，并且只在真正看到的时候才说"看到了"。
 *
 * 1. 投递（delivery）：Vercel 从哪个 commit 构建、构建是否完成、域名指向哪次部署、
 *    项目有没有被 ssoProtection 挡在登录页后面。这些能用 api.vercel.com 问到，是权威记录。
 * 2. 内容（content）：线上真正吐出来的字节，是不是本地这份源码构建出来的字节。
 *    这必须把线上文件拉下来逐字节比对，没有别的办法。
 * 3. 正确性（correctness）：代码本身对不对、测试过没过。这个脚本一概不管。
 *
 * 为什么非要把三件事拆开：因为这个仓库里已经有人（我）把第 1 件事说成了第 2 件。
 * 2026-11-08 我用手工比较 bundle 文件名的方式宣布过"线上与本机构建逐字节一致"，
 * 而文件名（Metro 的内容哈希）不是可靠的锚，两个方向都不成立：
 *   - c3cdafa：Vercel 构建日志 entry-ee0a0540… = 我本地同 commit 的构建；
 *   - aa7e073：只改了文档和一个脚本，Vercel 构建日志却是 entry-916c6498…（和更早的
 *     1125d5f 一样），我本地同 commit 的构建仍是 entry-ee0a0540…。
 * 同一份源码，线上与本地给出不同的文件名 —— 所以"文件名相同"不能证明"内容相同"，
 * "文件名不同"也不一定证明内容不同。一个证据如果两个方向都不成立，它就不该被写成结论。
 *
 * 现在唯一硬的判定是：把线上 index.html 与它引用的 entry-*.js 拉下来，对本地同 commit 的
 * 构建产物做逐字节比对（默认模式）。拉不到就明说"内容未观测"，并以退出码 1 结束 ——
 * 没观测就不签字，而不是拿投递当内容。
 *
 * 本机的现实（写在这里，免得下次又当成站点故障）：*.vercel.app 的 DNS 被污染
 * （解析到 69.63.178.13 这类 Facebook 地址），直连被 SNI 重置，公共取回器时通时不通。
 * 所以在这台机器上默认模式很可能报"内容未观测"，那不是站点坏了，是看不见。
 *
 * 用法：
 *   npm run deploy:verify                      # 投递 + 内容（内容要能取到线上字节）
 *   npm run deploy:verify -- --wait            # push 之后：等构建完成再验
 *   npm run deploy:verify -- --delivery-only   # 只验投递，输出里会写明"内容未验证"
 *   npm run deploy:verify -- --url=<站点地址>   # 换一个比对目标（负向测试用）
 *   npm run deploy:verify -- --reuse-dist      # 不重新构建，直接用现有 dist/
 *
 * 退出码：0 要求校验的每一项都真的通过 / 1 有失败或无法完成 / 2 缺少令牌。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.vercel.com';
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_fURFEaDvcwl9xE2ERBh8kKEPEIya';
const PRODUCTION_DOMAINS = (
  process.env.VERCEL_PRODUCTION_DOMAINS || 'dailystreak-app.vercel.app,dist-six-vert-70.vercel.app'
)
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);
const POLL_SECONDS = 10;

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const option = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const WAIT_MS = flag('wait') ? Number(option('wait') || 300) * 1000 : 0;
const DELIVERY_ONLY = flag('delivery-only');
const REUSE_DIST = flag('reuse-dist');
const SITE_URL = (option('url') || 'https://dailystreak-app.vercel.app').replace(/\/$/, '');

const git = (args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const short = (sha) => (sha ? sha.slice(0, 7) : '(无)');
const when = (iso) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const human = (n) => `${n} 字节`;

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
    // 没有 ~/.env 就走缺失分支
  }
  return null;
}

const FOUND_TOKEN = readToken();
if (!FOUND_TOKEN) {
  console.error('找不到 VERCEL_TOKEN：不在环境变量里，也不在 ~/.env 里。');
  console.error('没有令牌就问不出"线上是哪个 commit 构建的"。这个脚本的立场是：问不到就说问不到，');
  console.error('不猜"应该差不多吧"。—— 补上令牌后重跑：npm run deploy:verify');
  process.exit(2);
}
const TOKEN = FOUND_TOKEN.token;

async function api(pathname) {
  const res = await fetch(API + pathname, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} → ${body?.error?.message || `HTTP ${res.status}`}`);
  return body;
}

async function fetchBytes(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'follow' });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { buf: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? '超时' : err.message };
  }
}

/**
 * 线上字节的取法：先直连（在能连的机器上一秒到位），失败再用公共取回器。
 * 经取回器拿到的字节一律标明来源 —— 第三方是信任假设，不该混进"观测事实"里。
 */
async function fetchLive(url) {
  const attempts = [{ via: '直连', ...(await fetchBytes(url)) }];
  if (attempts[0].buf) return attempts;

  const proxies = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];
  for (const make of proxies) {
    const via = new URL(make(url)).host;
    const got = await fetchBytes(make(url));
    attempts.push({ via, ...got });
    if (got.buf) return attempts;
  }
  return attempts;
}

async function snapshot() {
  const remote = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
  const head = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']);

  const { deployments } = await api(`/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=10`);
  const latest = deployments[0] || null;
  const project = await api(`/v9/projects/${PROJECT_ID}`);

  const served = [];
  for (const domain of PRODUCTION_DOMAINS) {
    try {
      const alias = await api(`/v4/aliases/${encodeURIComponent(domain)}`);
      served.push({ domain, deploymentId: alias.deploymentId });
    } catch (err) {
      served.push({ domain, error: err.message });
    }
  }
  return { remote, head, dirty, latest, project, served };
}

/** 投递层面的每一条只证明它自己那一件事：域名指着谁，不等于线上跑的是你的代码。 */
function deliveryReport({ remote, head, dirty, latest, project, served }) {
  const ok = [];
  const bad = [];
  const lines = [];

  lines.push(`本地 HEAD：${short(head)}${dirty ? '（工作区不干净）' : '（工作区干净）'}`);
  lines.push(`远端 main（ls-remote 现取，不信本地缓存）：${short(remote)}`);

  if (head === remote) ok.push(`本地 HEAD 与远端 main 一致（${short(head)}）`);
  else bad.push(`本地 HEAD（${short(head)}）与远端 main（${short(remote)}）不同：先 push 或先 fetch`);

  if (!latest) {
    bad.push('这个项目没有任何生产部署');
    return { ok, bad, lines };
  }

  const sha = latest.meta?.githubCommitSha || '';
  lines.push(`生产部署：${short(sha)} ${latest.readyState} · ${when(latest.createdAt)} · ${latest.url}`);

  if (latest.readyState !== 'READY') bad.push(`生产部署状态是 ${latest.readyState}，还没构建完`);
  else if (sha === remote) ok.push(`生产部署由远端 main 的 ${short(sha)} 构建`);
  else bad.push(`生产部署来自 ${short(sha)}，不是远端 main 的 ${short(remote)}`);

  for (const { domain, deploymentId, error } of served) {
    if (error) {
      lines.push(`域名 ${domain}：查不到别名记录（${error}）`);
      bad.push(`问不出 ${domain} 指向哪次部署`);
    } else if (deploymentId === latest.uid) {
      ok.push(`${domain} 的别名记录指向这次部署`);
    } else {
      bad.push(`${domain} 指向 ${deploymentId}，不是最新那次 ${latest.uid}`);
    }
  }

  if (project.ssoProtection) {
    bad.push('项目级 ssoProtection 不为 null：访客看到的是 Vercel 登录页，不是应用');
  } else {
    ok.push('项目级 ssoProtection = null（外部可直接访问）');
  }

  return { ok, bad, lines };
}

/** 本地构建：与 Vercel 同一条命令（expo export -p web），产物落在 dist/。 */
function localBuild() {
  const distIndex = path.join(root, 'dist', 'index.html');
  if (!REUSE_DIST) {
    execFileSync('npx', ['expo', 'export', '-p', 'web'], { cwd: root, stdio: 'ignore' });
  } else if (!existsSync(distIndex)) {
    throw new Error('--reuse-dist 指定了，但 dist/index.html 不存在');
  }
  const bundleDir = path.join(root, 'dist', '_expo', 'static', 'js', 'web');
  const bundleName = readdirSync(bundleDir).find((f) => f.startsWith('entry-') && f.endsWith('.js'));
  if (!bundleName) throw new Error('本地构建里找不到 entry-*.js');
  return {
    index: readFileSync(distIndex),
    bundleName,
    bundle: readFileSync(path.join(bundleDir, bundleName)),
  };
}

/**
 * 内容校验：把线上 index.html 和它引用的 entry-*.js 拉下来，与本地同 commit 的构建逐字节比。
 * 这是唯一能说"线上跑的是这份代码"的证据，其余都只是投递。
 */
async function contentReport() {
  const ok = [];
  const bad = [];
  const lines = [];
  const local = localBuild();
  lines.push(`本地构建：dist/index.html ${human(local.index.length)} · ${local.bundleName} ${human(local.bundle.length)}`);

  const indexAttempts = await fetchLive(`${SITE_URL}/`);
  const indexHit = indexAttempts.find((a) => a.buf);
  if (!indexHit) {
    lines.push(`取线上 index.html：全部通道失败（${indexAttempts.map((a) => `${a.via}: ${a.error}`).join('；')}）`);
    bad.push('内容未观测：取不到线上 index.html，无法比对（这不是通过，是没看到）');
    return { ok, bad, lines };
  }
  lines.push(`取线上 index.html：成功，来源 ${indexHit.via}`);

  const liveName = (indexHit.buf.toString('utf8').match(/entry-[a-z0-9]+\.js/) || [])[0];
  if (!liveName) {
    bad.push('线上 index.html 里找不到 entry-*.js 引用');
    return { ok, bad, lines };
  }
  lines.push(`线上引用的 bundle：${liveName} · 本地：${local.bundleName}`);

  if (indexHit.buf.equals(local.index)) ok.push('index.html 逐字节相同');
  else
    bad.push(
      `index.html 不同（线上 ${sha256(indexHit.buf).slice(0, 12)}…，本地 ${sha256(local.index).slice(0, 12)}…）`,
    );

  const jsAttempts = await fetchLive(`${SITE_URL}/_expo/static/js/web/${liveName}`);
  const jsHit = jsAttempts.find((a) => a.buf);
  if (!jsHit) {
    bad.push('内容未观测：取不到线上 bundle，无法比对');
    return { ok, bad, lines };
  }
  lines.push(`取线上 bundle：成功，来源 ${jsHit.via}`);

  if (liveName !== local.bundleName) {
    bad.push(`线上 bundle 文件名与本地不同（线上 ${liveName}，本地 ${local.bundleName}）—— 文件名不是内容锚，但差异本身要报`);
  }
  if (jsHit.buf.equals(local.bundle)) ok.push(`${liveName} 逐字节相同（${human(local.bundle.length)}）`);
  else
    bad.push(
      `bundle 内容不同（线上 ${human(jsHit.buf.length)} / ${sha256(jsHit.buf).slice(0, 12)}…，本地 ${human(local.bundle.length)} / ${sha256(local.bundle).slice(0, 12)}…）`,
    );

  return { ok, bad, lines };
}

const format = ({ ok, bad, lines }) => {
  const out = lines.map((l) => `  ${l}`);
  if (out.length) out.push('');
  for (const o of ok) out.push(`  ✓ ${o}`);
  for (const b of bad) out.push(`  ✗ ${b}`);
  return out.join('\n');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOnce() {
  const snap = await snapshot();
  const delivery = deliveryReport(snap);
  const content = DELIVERY_ONLY ? null : await contentReport();
  return { delivery, content, ready: delivery.bad.length === 0 && (!content || content.bad.length === 0) };
}

async function main() {
  const deadline = Date.now() + WAIT_MS;
  let state = await runOnce();

  while (WAIT_MS && !state.ready && Date.now() < deadline) {
    const left = Math.round((deadline - Date.now()) / 1000);
    const why = (state.content ? state.content.bad[0] : null) || state.delivery.bad[0] || '';
    console.log(`还没通过（剩 ${left}s 重试）：${why.slice(0, 90)}`);
    await sleep(POLL_SECONDS * 1000);
    state = await runOnce();
  }

  console.log('投递（Vercel API 观测到的）');
  console.log(format(state.delivery));
  console.log('');
  console.log('内容（线上字节 vs 本地同 commit 构建）');
  console.log(
    state.content
      ? format(state.content)
      : '  - 本次用 --delivery-only 运行：内容未验证。上面全绿也只说明投递成功了。',
  );
  console.log('');
  console.log('这个脚本没有观测到的');
  console.log('  · 线上边缘真正吐给浏览器的字节 —— 除非上面"内容"一段明写了逐字节相同');
  console.log('  · 代码本身对不对、测试过没过 —— 那是 precheck 和 CI 的事，不归这里管');

  const failed = state.delivery.bad.length + (state.content ? state.content.bad.length : 0);
  if (failed) {
    console.log(`\n结论：${failed} 项没有通过或无法完成。`);
    process.exit(1);
  }
  console.log(state.content ? '\n结论：投递与内容两项都通过。' : '\n结论：投递通过；内容未验证（--delivery-only）。');
  process.exit(0);
}

main().catch((err) => {
  console.error(`部署校验没能完成：${err.message}`);
  process.exit(1);
});
