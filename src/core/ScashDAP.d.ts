/// <reference types="node" />

interface ScashNetwork {
    bech32?: string;
    [key: string]: any;
}

interface DapOutput {
    address: string;
    value: number;
}

declare class ScashDAP {
    /**
     * ScashDAP 协议实现
     * @param network 网络配置对象 (如 bitcoinjs-lib 的 network 对象)
     */
    constructor(network: ScashNetwork | string);

    /** 当前网络配置 */
    NETWORK: ScashNetwork | string;

    /**
     * 创建 DAP 输出
     * 将文本数据转换为链上交易输出
     * @param text 要上链的文本数据
     */
    createDapOutputs(text: string): DapOutput[];

    /**
     * 解析 DAP 交易
     * 从交易输出中还原文本数据
     * @param outputs 交易输出数组 (包含 scriptPubKey)
     */
    parseDapTransaction(outputs: any[]): string;

    /**
     * 将 Scash 地址解码为 32字节 Hash Buffer
     * @param address 钱包地址
     */
    decodeScashAddressToHash(address: string): Buffer | null;
}

export = ScashDAP;
