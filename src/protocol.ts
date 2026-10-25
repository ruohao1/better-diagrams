import type { ProjectSnapshot } from './model.ts';
export type LiveSnapshot = ProjectSnapshot & { sequence:number };
export type ProjectEvent = {type:'snapshot';snapshot:LiveSnapshot}|{type:'error';message:string};
export type ApiError = {code:string;message:string};
