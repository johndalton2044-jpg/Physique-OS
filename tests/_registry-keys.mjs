/* KEYED REGISTRIES IN THE SOURCE (catalogue W-008). A keyed registry (EVENT_TYPES, OBS_TYPES, SUPPLEMENT_CATALOGUE, ...)
   whose literal repeats a key, or that is extended later (Object.assign, NAME[key]=, NAME.key=) with a key it already
   has, silently keeps the last definition: the duplicate never reaches run time, so it can only be found here.
   literalKeys reads the top-level keys of one object literal without a parser dependency: it skips strings, template
   literals, comments and regular-expression literals, and tracks nesting. */
const REGEX_BEFORE=/[(,=:[!&|?{};+\-*%<>~^]/;
const REGEX_WORDS=new Set(['return','typeof','case','in','of','void','delete','instanceof','new','throw','else','do','yield','await']);
export function literalKeys(s,start){
  const keys=[],n=s.length;let depth=0,j=start,expectKey=false,prev='',word='';
  while(j<n){const c=s[j],d=s[j+1];
    if(c==='/'&&d==='*'){const k=s.indexOf('*/',j+2);j=k<0?n:k+2;continue;}
    if(c==='/'&&d==='/'){const k=s.indexOf('\n',j);j=k<0?n:k;continue;}
    if(c==="'"||c==='"'){let k=j+1;while(k<n&&s[k]!==c){if(s[k]==='\\')k++;k++;}
      if(depth===1&&expectKey){let m=k+1;while(m<n&&/\s/.test(s[m]))m++;if(s[m]===':')keys.push({key:s.slice(j+1,k),at:j});}
      expectKey=false;j=k+1;prev=c;word='';continue;}
    if(c==='`'){let k=j+1;while(k<n&&s[k]!=='`'){if(s[k]==='\\'){k+=2;continue;}
        if(s[k]==='$'&&s[k+1]==='{'){let dd=1;k+=2;while(k<n&&dd){if(s[k]==='{')dd++;else if(s[k]==='}')dd--;k++;}continue;}k++;}
      j=k+1;prev='`';word='';expectKey=false;continue;}
    if(c==='/'&&(prev===''||REGEX_BEFORE.test(prev)||REGEX_WORDS.has(word))){let k=j+1,cls=false;
      while(k<n&&s[k]!=='\n'){if(s[k]==='\\'){k+=2;continue;}if(s[k]==='[')cls=true;else if(s[k]===']')cls=false;else if(s[k]==='/'&&!cls)break;k++;}
      k++;while(k<n&&/[a-z]/i.test(s[k]))k++;j=k;prev='/';word='';expectKey=false;continue;}
    if(c==='{'||c==='['||c==='('){depth++;expectKey=(c==='{'&&depth===1);j++;prev=c;word='';continue;}
    if(c==='}'||c===']'||c===')'){depth--;j++;prev=c;word='';if(depth===0)break;continue;}
    if(c===','&&depth===1){expectKey=true;j++;prev=c;word='';continue;}
    if(/\s/.test(c)){j++;continue;}
    if(/[\w$]/.test(c)){let k=j;while(k<n&&/[\w$]/.test(s[k]))k++;
      if(depth===1&&expectKey){let m=k;while(m<n&&/\s/.test(s[m]))m++;if(s[m]===':'||s[m]==='(')keys.push({key:s.slice(j,k),at:j});}
      word=s.slice(j,k);expectKey=false;j=k;prev='a';continue;}
    expectKey=false;prev=c;word='';j++;}
  return keys;
}
const lineOf=(s,at)=>{let l=1;for(let i=0;i<at;i++)if(s.charCodeAt(i)===10)l++;return l;};
/* every key each named registry is given anywhere in the source, with where; then the keys given more than once */
export function keyedRegistryDuplicates(sources,names){
  const out=[];
  for(const N of names){const seen={};
    const add=(key,f,s,at)=>{(seen[key]=seen[key]||[]).push(f+':'+lineOf(s,at));};
    for(const [f,s] of Object.entries(sources)){
      const lit=new RegExp('(?:^|[^\\w$.])(?:var\\s+'+N+'\\s*=\\s*|Object\\.assign\\(\\s*'+N+'\\s*,\\s*)\\{','g');let m;
      while((m=lit.exec(s))){let at=m.index+m[0].length-1;
        for(;;){literalKeys(s,at).forEach(k=>add(k.key,f,s,k.at));
          /* Object.assign(N, {...}, {...}): each further literal argument */
          let e=at,depth=0;for(;e<s.length;e++){if(s[e]==='{')depth++;else if(s[e]==='}'){depth--;if(!depth)break;}}
          let k=e+1;while(k<s.length&&/[\s,]/.test(s[k]))k++;if(s[k]==='{'&&/,/.test(s.slice(e+1,k)))at=k;else break;}}
      const asg=new RegExp('(?:^|[^\\w$.])'+N+'(?:\\[\\s*([\'"])([^\'"]+)\\1\\s*\\]|\\.([A-Za-z_$][\\w$]*))\\s*=(?!=)','g');
      while((m=asg.exec(s)))add(m[2]||m[3],f,s,m.index);}
    Object.keys(seen).filter(k=>seen[k].length>1).forEach(k=>out.push({registry:N,key:k,locations:seen[k]}));}
  return out;
}
