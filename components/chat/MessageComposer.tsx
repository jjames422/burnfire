"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";
import { useChannelStream } from "@/lib/api/stream";
import type { AccountPayload, MentionCandidate, SessionInfo } from "@/lib/api/types";

interface ComposerProps { channelId:string; channelName:string; replyTo:{id:string;label:string}|null; onCancelReply:()=>void; onSent:()=>void; }
type Translator = (source: string, values?: Record<string, string | number>) => string;
interface Command { name:string; syntax:string; description:string; run:(argument:string,t:Translator)=>CommandResult; }
type CommandResult = { body?:string; notice?:string; clear?:boolean };

const commands: Command[] = [
  { name:"help", syntax:"/help", description:"Show the available chat commands", run:(_,t)=>({notice:t("Commands: /help, /me, /shrug, /guide, /bug, /roll, /poll, /spoiler, /clear")}) },
  { name:"me", syntax:"/me action", description:"Send an action-style message", run:(argument)=>({body:`— ${argument}`}) },
  { name:"shrug", syntax:"/shrug message", description:"Add a shrug to your message", run:(argument)=>({body:`${argument}${argument ? " " : ""}¯\\_(ツ)_/¯`}) },
  { name:"guide", syntax:"/guide topic", description:"Share a link to the field guide archive", run:(argument,t)=>({body:`${argument ? t("Field guide request: {topic}", { topic: argument }) : t("Field guide archive")} — https://lastasylumplague.org/guides`}) },
  { name:"bug", syntax:"/bug description", description:"Start a bug report from chat", run:(argument,t)=>({body:`${t("Bug report")}${argument ? `: ${argument}` : ""} — https://lastasylumplague.org/bugs`}) },
  { name:"roll", syntax:"/roll", description:"Roll a virtual six-sided die", run:(_,t)=>({body:t("🎲 Rolled {result}", { result: Math.floor(Math.random()*6)+1 })}) },
  { name:"poll", syntax:"/poll question", description:"Start a quick reaction poll", run:(argument,t)=>({body:t("📊 POLL: {question}\n👍 Yes   👎 No   🤷 Unsure", { question: argument || t("Vote below") })}) },
  { name:"spoiler", syntax:"/spoiler message", description:"Mark potentially sensitive game information", run:(argument,t)=>({body:t("⚠️ SPOILER — {message}", { message: argument })}) },
  { name:"clear", syntax:"/clear", description:"Clear your draft without sending", run:(_,t)=>({clear:true,notice:t("Draft cleared.")}) },
];

function activeMention(value:string) {
  const match=value.match(/(?:^|\s)@([^@\s]*)$/u);
  return match ? { query:match[1], start:value.length-match[1].length-1 } : null;
}

export function MessageComposer({ channelId,channelName,replyTo,onCancelReply,onSent }:ComposerProps) {
  const { t, locale } = useTranslation();
  const [body,setBody]=useState(""); const [sending,setSending]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const [attachment,setAttachment]=useState<File|null>(null); const fileInput=useRef<HTMLInputElement|null>(null);
  const [mentions,setMentions]=useState<MentionCandidate[]>([]); const [selectedMentions,setSelectedMentions]=useState<MentionCandidate[]>([]); const [typingUsers,setTypingUsers]=useState<Map<string,string>>(new Map()); const [identity,setIdentity]=useState("A survivor"); const [userId,setUserId]=useState("");
  const typingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mention=activeMention(body); const commandQuery=body.startsWith("/")&&!body.includes(" ") ? body.slice(1).toLowerCase() : null;
  const visibleCommands=useMemo(()=>commandQuery===null?[]:commands.filter((command)=>command.name.startsWith(commandQuery)),[commandQuery]);

  useEffect(()=>{ let active=true;
    api<AccountPayload>("/api/account").then(({data})=>{if(active&&data)setIdentity(data.identity_label);});
    api<SessionInfo>("/api/auth/session").then(({data})=>{if(active)setUserId(data?.user?.id??"");});
    return()=>{active=false;if(typingTimer.current)clearTimeout(typingTimer.current);};
  },[channelId]);

  useChannelStream(channelId, useCallback((event)=>{
    if(event.type!=="typing")return;
    setTypingUsers((current)=>{const next=new Map(current); if(event.typing)next.set(event.user_id,event.identity_label);else next.delete(event.user_id);return next;});
    if(event.typing)setTimeout(()=>setTypingUsers((current)=>{const next=new Map(current);next.delete(event.user_id);return next;}),3500);
  },[]));

  useEffect(()=>{ if(!mention){setMentions([]);return;} const timer=setTimeout(()=>api<{candidates:MentionCandidate[]}>(`/api/channels/${channelId}/mentions?q=${encodeURIComponent(mention.query)}`).then(({data})=>setMentions(data?.candidates??[])),120); return()=>clearTimeout(timer); },[channelId,mention?.query]);

  function broadcastTyping(typing:boolean){ if(userId)apiPost(`/api/channels/${channelId}/typing`,{typing}); }
  function change(value:string){setBody(value);setError(null);setNotice(null);broadcastTyping(true);if(typingTimer.current)clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>broadcastTyping(false),1200);}
  function chooseMention(candidate:MentionCandidate){if(!mention)return;setBody(`${body.slice(0,mention.start)}@${candidate.mention_text} `);setSelectedMentions((current)=>current.some((item)=>item.user_id===candidate.user_id)?current:[...current,candidate]);setMentions([]);}
  function chooseCommand(command:Command){setBody(command.syntax.includes(" ")?`/${command.name} `:`/${command.name}`);}
  async function submit(event:SubmitEvent<HTMLFormElement>){event.preventDefault();if(!body.trim()&&!attachment)return;let outgoing=body.trim()||t("Shared {filename}", { filename: attachment?.name ?? "" });if(outgoing.startsWith("/")){const [token,...rest]=outgoing.slice(1).split(" ");const command=commands.find((item)=>item.name===token.toLowerCase());if(!command){setError(t("Unknown command /{command}. Type /help to see available commands.", { command: token }));return;}const result=command.run(rest.join(" ").trim(),t);if(result.clear){setBody("");setNotice(result.notice??null);return;}if(result.notice&&!result.body){setNotice(result.notice);return;}outgoing=result.body??outgoing;}
    setSending(true);setError(null);broadcastTyping(false);
    try {
      const form=new FormData();
      form.set("body",outgoing);
      if(replyTo?.id)form.set("parent_message_id",replyTo.id);
      form.set("mentioned_user_ids",JSON.stringify(selectedMentions.map((item)=>item.user_id)));
      if(attachment)form.set("attachment",attachment);
      const {data,error:sendError}=await api<{message_id:string;attachment_error:string|null}>(`/api/channels/${channelId}/messages`,{method:"POST",body:form});
      if(sendError||!data){setError(t("Message was not sent: {error}", { error: t(sendError ?? "Unknown error") }));return;}
      if(data.attachment_error){setError(data.attachment_error);setBody("");setAttachment(null);onSent();return;}
      setBody("");setAttachment(null);setSelectedMentions([]);setNotice(t("Message sent."));onSent();
    } catch {
      setError(t("Message was not sent. Check your connection and try again."));
    } finally { setSending(false); }
  }
  function keyDown(event:KeyboardEvent<HTMLTextAreaElement>){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}
  const typers=[...typingUsers.entries()].filter(([id])=>id!==userId).map(([,label])=>label);

  return <form onSubmit={submit} className="composer">
    {replyTo&&<div className="reply-banner"><span><Text>{"Replying to"}</Text>{" "}<strong>{replyTo.label}</strong></span><button type="button" onClick={onCancelReply}>×</button></div>}
    {(visibleCommands.length>0||mentions.length>0)&&<div className="composer-suggestions" role="listbox"><header>{mentions.length>0?t("Mention a survivor"):t("Commands")}<span>{mentions.length||visibleCommands.length}</span></header>{mentions.map((candidate)=><button type="button" key={candidate.user_id} onClick={()=>chooseMention(candidate)}><b>@</b><span><strong>{candidate.identity_label}</strong><small><Text>{"Notify this survivor"}</Text></small></span></button>)}{mentions.length===0&&visibleCommands.map((command)=><button type="button" key={command.name} onClick={()=>chooseCommand(command)}><b>/</b><span><strong>{command.syntax}</strong><small>{t(command.description)}</small></span></button>)}</div>}
    {attachment&&<div className="attachment-draft"><span>◆</span><div><strong>{attachment.name}</strong><small><Text values={{ value1: String((attachment.size/1024/1024).toFixed(2) ?? "") }}>{"{value1}  MB"}</Text></small></div><button type="button" onClick={()=>setAttachment(null)}>×</button></div>}
    <div className="composer-box"><input ref={fileInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain" onChange={(event)=>{const file=event.target.files?.[0]??null;if(file&&file.size>26214400){setError(t("Attachments must be 25 MB or smaller."));return;}setAttachment(file);setError(null);}}/><button type="button" className="composer-tool" onClick={()=>fileInput.current?.click()} title={t("Attach an image, PDF, or text file")}>＋</button><textarea rows={1} maxLength={2000} spellCheck lang={locale} autoCorrect="on" autoCapitalize="sentences" value={body} onChange={(event)=>change(event.target.value)} onKeyDown={keyDown} placeholder={t("Message #{channel}", { channel: t(channelName) })} aria-label={t("Message #{channel}", { channel: t(channelName) })} /><button type="button" className="composer-tool" title={t("Type @ to mention or / for commands")}>@</button><button disabled={sending||(!body.trim()&&!attachment)} className="send-button"><span>{sending?"…":"➤"}</span><span className="sr-only"><Text>{"Send"}</Text></span></button></div>
    <div className="composer-foot"><span>{typers.length>0?t("{names} typing…", { names: typers.slice(0,2).join(", ") }):t("Enter to send · Shift+Enter for a new line")}</span><span>{<LocalizedNumber value={body.length} />}/2000</span></div>{notice&&<p className="composer-notice">{t(notice)}</p>}{error&&<p className="composer-error">{t(error)}</p>}
  </form>;
}
