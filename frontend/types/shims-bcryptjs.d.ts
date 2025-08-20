declare module 'bcryptjs' {
  export function compare(data: string, encrypted: string): Promise<boolean>
  export function hash(data: string, salt: string | number): Promise<string>
  export function genSaltSync(rounds?: number): string
  const _default: any
  export default _default
}
