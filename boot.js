import { requireLogin } from "./auth.js";

async function startDaylog() {
  await requireLogin();
  if (document.body.classList.contains("article-page")) {
    await import("./article.js?v=9");
  } else {
    await import("./app.js?v=9");
  }
}

startDaylog().catch(error => {
  document.documentElement.classList.remove("daylog-auth-checking");
  console.error("日迹启动失败", error);
});
