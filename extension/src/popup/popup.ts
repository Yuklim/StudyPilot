// The baseline popup states plainly that nothing is implemented yet. It must not
// offer a button that does nothing: a control the user can press and that
// silently fails is worse than an honest empty state.
//
// Kept free of DOM access so it stays importable from tests; `main.ts` does the
// wiring.
export function popupText(version: string): string {
  return `StudyPilot 采集 v${version}：工程框架已就绪，网页采集功能尚未实现。`
}
