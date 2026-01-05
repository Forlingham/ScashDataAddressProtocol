/// <reference types="node" />

interface ScashNetwork {
  bech32?: string
  [key: string]: any
}

interface DapOutput {
  address: string
  value: number
}

interface ProtocolDef {
  magic: Buffer
  description: string
}

interface Protocols {
  RAW: ProtocolDef
  ZIP: ProtocolDef
  [key: string]: ProtocolDef
}

declare class ScashDAP {
  /** 库版本号 */
  static readonly version: string;

  /**
   * ScashDAP 协议实现
   * @param network 网络配置对象 (如 bitcoinjs-lib 的 network 对象)
   * @param debug 是否开启调试日志 (默认 false)
   */
  constructor(network: ScashNetwork | string, debug?: boolean)

  /** 当前网络配置 */
  NETWORK: ScashNetwork | string

  /** 是否开启调试模式 */
  debug: boolean

  /** 协议定义 */
    PROTOCOLS: Protocols;

    /**
     * 估算上链成本
     * @param text 要上链的文本
     */
    estimateCost(text: string): {
        mode: string;
        payloadSize: number;
        chunkCount: number;
        totalSats: number;
        originalSize: number;
    };

    /**
     * 获取地址使用的协议类型
     * @param address 钱包地址
     * @returns 'RAW' | 'ZIP' | null
     */
    getProtocolType(address: string): string | null;

    /**
     * 创建 DAP 输出
   * 将文本数据转换为链上交易输出
   * @param text 要上链的文本数据
   */
  createDapOutputs(text: string): DapOutput[]

  /**
     * 解析 DAP 交易
     * 从交易输出中还原文本数据
     * 
     * @security 安全警告：
     * 返回的数据可能包含恶意代码（如 XSS）。
     * 在浏览器渲染时请使用 innerText 而非 innerHTML。
     * 
     * @param outputs 交易输出数组 (包含 scriptPubKey)
     */
    parseDapTransaction(outputs: any[]): string;

  /**
   * 验证地址是否为 ScashDAP 地址
   * @param address 钱包地址
   */
  isScashDAPAddress(address: string): boolean

  /**
   * 将 Scash 地址解码为 32字节 Hash Buffer
   * @param address 钱包地址
   */
  private decodeScashAddressToHash(address: string): Buffer | null
}

export = ScashDAP
