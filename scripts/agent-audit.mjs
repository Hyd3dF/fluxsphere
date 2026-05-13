import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const schemaPath = path.join(root, 'supabase', 'schema.sql');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (/\.(svelte|js|css)$/.test(entry.name)) return [full];
    return [];
  }));
  return files.flat();
}

async function readWorkspace() {
  const files = await walk(srcRoot);
  files.push(schemaPath);
  const pairs = await Promise.all(files.map(async (file) => [
    path.relative(root, file).replaceAll('\\', '/'),
    await readFile(file, 'utf8')
  ]));
  return new Map(pairs);
}

function lineOf(source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) return 1;
  return source.slice(0, index).split('\n').length;
}

function createBus() {
  const findings = [];
  return {
    publish(agent, severity, file, needle, message) {
      const source = workspace.get(file) ?? '';
      findings.push({ agent, severity, file, line: lineOf(source, needle), message });
    },
    findings
  };
}

const workspace = await readWorkspace();
const bus = createBus();

const agents = [
  {
    name: 'session-agent',
    run() {
      for (const [file, source] of workspace) {
        if (!file.startsWith('src/routes/me/') || !source.includes("goto('/login')")) continue;
        if (!source.includes('await initAuth()')) {
          bus.publish(this.name, 'high', file, "goto('/login')", 'Protected route redirects before auth initialization is awaited.');
        }
      }
      const auth = workspace.get('src/lib/stores/auth.js') ?? '';
      if (!auth.includes('profileLoadSeq')) {
        bus.publish(this.name, 'medium', 'src/lib/stores/auth.js', 'onAuthStateChange', 'Profile loading is not guarded against auth event races.');
      }
    }
  },
  {
    name: 'data-agent',
    run() {
      const schema = workspace.get('supabase/schema.sql') ?? '';
      if (!schema.includes('avatar_url text')) {
        bus.publish(this.name, 'high', 'supabase/schema.sql', 'profiles', 'Profiles table has no avatar column.');
      }
      if (!schema.includes("values ('avatars', 'avatars', true)")) {
        bus.publish(this.name, 'high', 'supabase/schema.sql', 'storage.buckets', 'Avatar storage bucket is missing.');
      }
      if (!schema.includes('validate_comment_parent')) {
        bus.publish(this.name, 'medium', 'supabase/schema.sql', 'comments', 'Comment parent/photo consistency is not enforced.');
      }
    }
  },
  {
    name: 'performance-agent',
    run() {
      const auth = workspace.get('src/lib/stores/auth.js') ?? '';
      if (!auth.includes('categoriesPromise')) {
        bus.publish(this.name, 'medium', 'src/lib/stores/auth.js', 'loadCategories', 'Category loading is not cached or deduplicated.');
      }
      for (const [file, source] of workspace) {
        if (!source.includes('setTimeout')) continue;
        if (!source.includes('return () => clearTimeout')) {
          bus.publish(this.name, 'medium', file, 'setTimeout', 'Debounced work should clean up timers when state changes.');
        }
      }
      const photo = workspace.get('src/routes/photo/[id]/+page.svelte') ?? '';
      if (photo.includes('repliesFor(')) {
        bus.publish(this.name, 'medium', 'src/routes/photo/[id]/+page.svelte', 'repliesFor', 'Comment replies are recalculated by filtering the full list per row.');
      }
    }
  },
  {
    name: 'ui-agent',
    run() {
      const edit = workspace.get('src/routes/me/edit/+page.svelte') ?? '';
      if (!edit.includes('type="file"') || !edit.includes("storage.from('avatars')")) {
        bus.publish(this.name, 'high', 'src/routes/me/edit/+page.svelte', 'Edit profile', 'Profile editor does not upload avatar images.');
      }
      const css = workspace.get('src/app.css') ?? '';
      if (!css.includes('.avatar img')) {
        bus.publish(this.name, 'medium', 'src/app.css', '.avatar', 'Avatar image rendering styles are missing.');
      }
    }
  }
];

for (const agent of agents) agent.run();

if (!bus.findings.length) {
  console.log('agent-audit: all sub-agents passed');
  process.exit(0);
}

console.log('agent-audit: findings');
for (const finding of bus.findings) {
  console.log(`[${finding.severity}] ${finding.agent} ${finding.file}:${finding.line} - ${finding.message}`);
}
process.exit(bus.findings.some((finding) => finding.severity === 'high') ? 1 : 0);
