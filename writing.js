export function smartType(input,enabled){
  if(!enabled)return;const selection=getSelection();if(!selection.rangeCount||!selection.isCollapsed)return;
  const node=selection.focusNode;if(node?.nodeType!==3||!input.contains(node)||node.parentElement.closest('b,strong'))return;
  const before=node.data.slice(0,selection.focusOffset),label=/^(结论|原因|计划|反思|复盘|心得|观察|教训|明日计划|买入理由|卖出理由|风险|心情|收获|记录|事件)[：:]$/.exec(before);
  const marked=/\*\*([^*\n]+)\*\*$/.exec(before);
  if((!label||node.previousSibling)&&!marked)return;
  const m=marked||label,strong=document.createElement('strong');strong.textContent=marked?m[1]:m[0];
  const tail=node.splitText(selection.focusOffset),match=node.splitText(m.index);match.replaceWith(strong);
  tail.insertData(0,'\u200b');const range=document.createRange();range.setStart(tail,1);range.collapse(true);selection.removeAllRanges();selection.addRange(range)
}
export function pastePlain(e){e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))}
