export type Platform = 'Steam' | 'Epic Games';
export interface Profile { id: string; name: string; platform: Platform; directory: string; }
export interface State { profiles: Profile[]; originals: Record<Platform,string>; epicLaunchUri: string; }
export interface ModVersion {version:string;description?:string;gameVersion?:string;dependencies:{id:string;version?:string}[];downloads:Record<string,unknown>;}
export interface Mod {id:string;name:string;description:string;versions:ModVersion[];}
export interface Catalog {registry:{schemaVersion:number;mods:Mod[]};source:string;}
export interface ModStatus {ready:boolean;architecture:string|null;message?:string;installed:{id:string;version:string;intact:boolean}[];}
export interface ModPlan {id:string;architecture:string;mods:{id:string;name:string;version:string;url:string;verified:boolean}[];}
export interface Bridge {
  load(): Promise<State>;
  save(s: State): Promise<State>;
  pickFolder(): Promise<string|null>;
  prepare(id: string): Promise<string>;
  launch(id: string): Promise<string>;
  openFolder(id: string): Promise<void>;
  modCatalog():Promise<Catalog>;
  modStatus(id:string):Promise<ModStatus>;
  modPlan(id:string,modId:string,version:string):Promise<ModPlan>;
  installMods(id:string,planId:string):Promise<{message:string;backup:string}>;
  onModProgress(callback:(message:string)=>void):()=>void;
}
declare global {interface Window {manager?:Bridge;}}
