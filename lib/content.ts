import { promises as fs } from "fs";
import path from "path";

export interface SiteContent {
  brand: {
    title: string;
    subtitle: string;
    heroText: string;
  };
  teacher: {
    name: string;
    role: string;
    bio: string[];
  };
  services: Array<{ en: string; zh: string; desc: string }>;
  details: Array<{ en: string; zh: string; items: string[] }>;
}

const CONTENT_PATH = path.join(process.cwd(), "data", "content.json");

const OWNER = process.env.GITHUB_OWNER || "coco-color-website";
const REPO = process.env.GITHUB_REPO || "coco-color-website";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "data/content.json";

const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;

function isLocalDev() {
  return process.env.NODE_ENV === "development";
}

async function triggerNetlifyDeploy() {
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    console.warn("Netlify deploy skipped: token or site id missing");
    return;
  }

  try {
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error("Netlify deploy trigger failed:", await res.text());
    } else {
      console.log("Netlify deploy triggered");
    }
  } catch (err) {
    console.error("Netlify deploy trigger error:", err);
  }
}

export async function getContent(): Promise<SiteContent> {
  if (isLocalDev()) {
    const raw = await fs.readFile(CONTENT_PATH, "utf-8");
    return JSON.parse(raw) as SiteContent;
  }

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 0 },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API GET failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return JSON.parse(decoded) as SiteContent;
}

export async function saveContent(content: SiteContent, message?: string) {
  const json = JSON.stringify(content, null, 2);

  if (isLocalDev()) {
    await fs.writeFile(CONTENT_PATH, json, "utf-8");
    return { sha: "local" };
  }

  // 先获取当前文件的 sha
  const getRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 0 },
    }
  );

  if (!getRes.ok) {
    throw new Error(`GitHub API GET sha failed: ${getRes.status}`);
  }

  const { sha } = await getRes.json();

  const putRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message || "Update site content from admin",
        content: Buffer.from(json).toString("base64"),
        sha,
      }),
    }
  );

  if (!putRes.ok) {
    throw new Error(`GitHub API PUT failed: ${putRes.status} ${await putRes.text()}`);
  }

  // 保存成功后触发 Netlify 重新部署
  await triggerNetlifyDeploy();

  return await putRes.json();
}
