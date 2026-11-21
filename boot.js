import { requireLogin } from "./auth.js";

async function startDaylog() {
  await requireLogin();
  if (document.body.classList.contains("article-page")) {
    await import("./article.js");
  } else {
    await import("./app.js");
  }
}

startDaylog().catch(error => {
  document.documentElement.classList.remove("daylog-auth-checking");
  console.error("日迹启动失败", error);
});
