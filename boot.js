import { requireLogin } from "./auth.js";

async function startDaylog() {
  await requireLogin();
  if (document.body.classList.contains("article-page")) {
    await import("./article.js");
  } else if (document.body.classList.contains("fish-page")) {
    await import("./fish.js?v=20261122b");
  } else {
    await import("./app.js");
  }
}

startDaylog().catch(error => {
  document.documentElement.classList.remove("daylog-auth-checking");
  if (document.body.classList.contains("fish-page")) {
    document.getElementById("presence").textContent = "连接失败";
    document.getElementById("status").textContent = "聊天组件加载失败，请刷新页面重试。";
  }
  console.error("日迹启动失败", error);
});
