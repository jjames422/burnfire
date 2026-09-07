import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots=["app","components","config","content","docs","lib","scripts","supabase"];
const ignored=new Set(["node_modules",".next",".git"]);
const checked=new Set([".ts",".tsx",".js",".mjs",".md",".mdx",".sql",".json",".css"]);
const problems=[];
const prohibitedAttribution=new RegExp(["clau","de"].join(""),"i");
const deprecatedReactType=new RegExp(`\\b${["Form","Event"].join("")}\\b`);

async function scan(path){
  for(const entry of await readdir(path,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const full=join(path,entry.name);
    if(prohibitedAttribution.test(entry.name))problems.push(`Forbidden attribution name in path: ${full}`);
    if(entry.isDirectory()){await scan(full);continue;}
    if(!checked.has(extname(entry.name)))continue;
    const source=await readFile(full,"utf8");
    if(prohibitedAttribution.test(source))problems.push(`Forbidden attribution name in content: ${full}`);
    if(deprecatedReactType.test(source))problems.push(`Deprecated React form-event type: ${full}`);
  }
}

for(const root of roots)await scan(join(process.cwd(),root));
if(problems.length)throw new Error(problems.join("\n"));
console.log("Source policy checks passed.");
