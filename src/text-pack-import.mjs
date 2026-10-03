import {updatePersonaProfile} from './persona-state.mjs';
import {resolvePersonaProfile} from './personas.mjs';

const categories=new Set(['greeting','daily','affection','teasing','seduction','comfort','jealousy','praise','goodnight','fallback']);
const key=text=>text.normalize('NFKC').replace(/\s+/gu,' ').trim();
const id=()=>globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Validate the complete batch before changing a profile. Never evict old rows. */
export function importTextPackEntries(state,personaId,{pack,entries}={}) {
  const profile=state.personas?.[personaId];
  if(!profile)throw new Error('这个角色已不存在，请重新选择角色。');
  if(!pack || !/^[a-zA-Z0-9_-]{1,80}$/.test(pack.id || '') || typeof pack.title!=='string')throw new Error('文本包信息无效，请重新打开文本包。');
  if(!Array.isArray(entries) || !entries.length || entries.length>40)throw new Error('请选择 1 至 40 条语料。');
  const existing=profile.customCorpora || [],seen=new Set(existing.map(item=>key(item.text))),added=[];
  let duplicates=0;
  for(const entry of entries) {
    if(!entry || typeof entry.text!=='string' || !entry.text.trim() || entry.text.length>240)throw new Error('每条语料需要 1 至 240 字，未导入任何内容。');
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(entry.id || ''))throw new Error('文本包片段编号无效。');
    const text=entry.text.trim(),normalized=key(text);
    if(seen.has(normalized)){duplicates++;continue;}
    seen.add(normalized);
    added.push({id:id(),title:`${pack.title} · ${text.slice(0,24)}`.slice(0,60),text,
      category:categories.has(entry.category)?entry.category:'fallback',level:profile.intimacyLevel,
      enabled:true,createdAt:Date.now(),voiceProfileId:profile.voiceProfileId,
      sourcePack:{id:pack.id,entryId:entry.id,title:pack.title,sourceName:pack.sourceName,
        chapter:entry.source?.chapter,page:entry.source?.page,paragraph:entry.source?.paragraph,speaker:entry.speaker}});
  }
  if(existing.length+added.length>40)throw new Error(`这个角色最多保存 40 条语料，还能加入 ${Math.max(0,40-existing.length)} 条；原有语料没有改变。`);
  if(!added.length)return {state,added:0,duplicates};
  const patch={...profile,customCorpora:[...existing,...added]};
  // Existing persona validators also guard template placeholders and prompt size.
  resolvePersonaProfile(patch);
  return {state:updatePersonaProfile(state,personaId,{customCorpora:patch.customCorpora}),added:added.length,duplicates};
}
