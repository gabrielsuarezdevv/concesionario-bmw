export const VIEWER_ENVIRONMENTS = [
  {id:'studio',name:'Estudio',symbol:'◈'},
  {id:'day',name:'Día',symbol:'☀'},
  {id:'night',name:'Noche',symbol:'☾'}
] as const;
export type ViewerEnvironment = typeof VIEWER_ENVIRONMENTS[number]['id'];
