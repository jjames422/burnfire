"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

interface ComposerProps { channelId:string; channelName:string; replyTo:{id:string;label:string}|null; onCancelReply:()=>void; onSent:()=>void; }
interface MentionCandidate { user_id:string; identity_label:string; mention_text:string; }
interface TypingEvent { user_id:string; identity_label:string; typing:boolean; }
interface Command { name:string; syntax:string; description:string; run:(argument:string)=>CommandResult; }
type CommandResult = { body?:string; notice?:string; clear?:boolean };

const commands: Command[] = [
  { name:"help", syntax:"/help", description:"Show the available chat commands", run:()=>({notice:"Commands: /help, /me, /shrug, /guide, /bug, /clear"}) },
  { name:"me", syntax:"/me action", description:"Send an action-style message", run:(argument)=>({body:`— ${argument}`}) },
  { name:"shrug", syntax:"/shrug message", description:"Add a shrug to your message", run:(argument)=>({body:`${argument}${argument ? " " : ""}¯\\_(ツ)_/¯`}) },
  { name:"guide", syntax:"/guide topic", description:"Share a link to the field guide archive", run:(argument)=>({body:`Field guide${argument ? ` request: ${argument}` : " archive"} — https://lastasylumplague.org/guides`}) },
  { name:"bug", syntax:"/bug description", description:"Start a bug report from chat", run:(argument)=>({body:`Bug report${argument ? `: ${argument}` : ""} — https://lastasylumplague.org/bugs`}) },
  { name:"clear", syntax:"/clear", description:"Clear your draft without sending", run:()=>({clear:true,notice:"Draft cleared."}) },
];

function activeMention(value:string) {
  const match=value.match(/(?:^|\s)@([^@\s]*)$/u);
  return match ? { query:match[1], start:value.length-match[1].length-1 } : null;
}

export function MessageComposer({ channelId,channelName,replyTo,onCancelReply,onSent }:ComposerProps) {
  const [body,setBody]=useState(""); const [sending,setSending]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const [mentions,setMentions]=useState<MentionCandidate[]>([]); const [selectedMentions,setSelectedMentions]=useState<MentionCandidate[]>([]); const [typingUsers,setTypingUsers]=useState<Map<string,string>>(new Map()); const [identity,setIdentity]=useState("A survivor"); const [userId,setUserId]=useState("");
  const typingChannel=useRef<RealtimeChannel|null>(null); const typingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mention=activeMention(body); const commandQuery=body.startsWith("/")&&!body.includes(" ") ? body.slice(1).toLowerCase() : null;
  const visibleCommands=useMemo(()=>commandQuery===null?[]:commands.filter((command)=>command.name.startsWith(commandQuery)),[commandQuery]);

  useEffect(()=>{ if(!supabase)return; const client=supabase; let active=true; client.rpc("get_my_chat_identity").then(({data})=>{if(active&&data)setIdentity(data);}); client.auth.getUser().then(({data})=>{if(active)setUserId(data.user?.id??"");}); client.realtime.setAuth().then(()=>{if(!active)return; const channel=client.channel(`typing:${channelId}`,{config:{private:true,broadcast:{self:false}}}); channel.on("broadcast",{event:"typing"},({payload})=>{const event=payload as TypingEvent; setTypingUsers((current)=>{const next=new Map(current); if(event.typing)next.set(event.user_id,event.identity_label);else next.delete(event.user_id);return next;}); if(event.typing)setTimeout(()=>setTypingUsers((current)=>{const next=new Map(current);next.delete(event.user_id);return next;}),3500);}).subscribe(); typingChannel.current=channel;}); return()=>{active=false;if(typingTimer.current)clearTimeout(typingTimer.current);if(typingChannel.current)client.removeChannel(typingChannel.current);}; },[channelId]);

  useEffect(()=>{ if(!supabase||!mention){setMentions([]);return;} const timer=setTimeout(()=>supabase!.rpc("get_channel_mention_candidates",{p_channel_id:channelId,p_query:mention.query,p_limit:8}).then(({data})=>setMentions(data??[])),120); return()=>clearTimeout(timer); },[channelId,mention?.query]);

  function broadcastTyping(typing:boolean){ if(userId)typingChannel.current?.send({type:"broadcast",event:"typing",payload:{user_id:userId,identity_label:identity,typing}}); }
  function change(value:string){setBody(value);setError(null);setNotice(null);broadcastTyping(true);if(typingTimer.current)clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>broadcastTyping(false),1200);}
  function chooseMention(candidate:MentionCandidate){if(!mention)return;setBody(`${body.slice(0,mention.start)}@${candidate.mention_text} `);setSelectedMentions((current)=>current.some((item)=>item.user_id===candidate.user_id)?current:[...current,candidate]);setMentions([]);}
  function chooseCommand(command:Command){setBody(command.syntax.includes(" ")?`/${command.name} `:`/${command.name}`);}
  async function submit(event:FormEvent){event.preventDefault();if(!supabase||!body.trim())return;let outgoing=body.trim();if(outgoing.startsWith("/")){const [token,...rest]=outgoing.slice(1).split(" ");const command=commands.find((item)=>item.name===token.toLowerCase());if(!command){setError(`Unknown command /${token}. Type /help to see available commands.`);return;}const result=command.run(rest.join(" ").trim());if(result.clear){setBody("");setNotice(result.notice??null);return;}if(result.notice&&!result.body){setNotice(result.notice);return;}outgoing=result.body??outgoing;}
    setSending(true);setError(null);broadcastTyping(false);
    try {
      const {error:sendError}=await supabase.rpc("post_channel_message",{p_channel_id:channelId,p_body:outgoing,p_parent_message_id:replyTo?.id??null,p_mentioned_user_ids:selectedMentions.map((item)=>item.user_id)});
      if(sendError){setError(`Message was not sent: ${sendError.message}`);return;}
      setBody("");setSelectedMentions([]);setNotice("Message sent.");onSent();
    } catch {
      setError("Message was not sent. Check your connection and try again.");
    } finally { setSending(false); }
  }
  function keyDown(event:KeyboardEvent<HTMLTextAreaElement>){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}
  const typers=[...typingUsers.values()].filter((label)=>label!==identity);

  return <form onSubmit={submit} className="composer-wrap">
    {replyTo&&<div className="reply-banner"><span>Replying to <strong>{replyTo.label}</strong></span><button type="button" onClick={onCancelReply}>×</button></div>}
    {(visibleCommands.length>0||mentions.length>0)&&<div className="composer-suggestions" role="listbox"><header>{mentions.length>0?"Mention a survivor":"Commands"}<span>{mentions.length||visibleCommands.length}</span></header>{mentions.map((candidate)=><button type="button" key={candidate.user_id} onClick={()=>chooseMention(candidate)}><b>@</b><span><strong>{candidate.identity_label}</strong><small>Notify this survivor</small></span></button>)}{mentions.length===0&&visibleCommands.map((command)=><button type="button" key={command.name} onClick={()=>chooseCommand(command)}><b>/</b><span><strong>{command.syntax}</strong><small>{command.description}</small></span></button>)}</div>}
    <div className="composer-box"><button type="button" className="composer-tool" title="Attachments are coming in the next update">＋</button><textarea rows={1} maxLength={2000} required spellCheck autoCapitalize="sentences" value={body} onChange={(event)=>change(event.target.value)} onKeyDown={keyDown} placeholder={`Message #${channelName}`} aria-label={`Message #${channelName}`} /><button type="button" className="composer-tool" title="Type @ to mention or / for commands">@</button><button disabled={sending} className="send-button"><span>{sending?"…":"➤"}</span><span className="sr-only">Send</span></button></div>
    <div className="composer-foot"><span>{typers.length>0?`${typers.slice(0,2).join(" and ")} ${typers.length===1?"is":"are"} typing…`:"Enter to send · Shift+Enter for a new line"}</span><span>{body.length}/2000</span></div>{notice&&<p className="composer-notice">{notice}</p>}{error&&<p className="composer-error">{error}</p>}
  </form>;
}
