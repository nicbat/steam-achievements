import {loadDataset,saveDataset,type Dataset} from './browser-storage';
/** One mutation lane within a tab; IDB revision checks protect the other tabs. */
export class DatasetSession {
 current:Dataset;pending=0;unsaved:Dataset|null=null;private lane:Promise<unknown>=Promise.resolve();
 constructor(initial:Dataset,private notify:(data:Dataset)=>void){this.current=initial;}
 private queue<T>(action:()=>Promise<T>):Promise<T>{this.pending++;const result=this.lane.then(action).finally(()=>{this.pending--;});this.lane=result.catch(()=>{});return result;}
 update(change:(data:Dataset)=>void):Promise<Dataset>{return this.queue(async()=>{
  if(this.unsaved)throw Error('Save or export the unsaved changes before continuing.');
  const next=structuredClone(this.current);change(next);
  try{this.current=await saveDataset(next,this.current.revision);this.notify(this.current);return this.current;}
  catch(e){this.unsaved=next;throw e;}
 });}
 retry():Promise<Dataset>{return this.queue(async()=>{if(!this.unsaved)return this.current;
  // Never rebase unsaved edits onto a newer revision from a different tab.
  const next=await saveDataset(this.unsaved,this.unsaved.revision);this.current=next;this.unsaved=null;this.notify(this.current);return this.current;
 });}
 reload():Promise<Dataset>{return this.queue(async()=>{this.current=await loadDataset();this.notify(this.current);return this.current;});}
}
