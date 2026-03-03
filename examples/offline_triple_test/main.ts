import { PrivateKey } from '@bsv/sdk/primitives';
import type { UTXO } from '../../src/types';
import { tripleBuildFeePoolBaseTx } from '../../src/triple_endpoint/1base_tx';
import { tripleBuildFeePoolSpendTX } from '../../src/triple_endpoint/2client_spend_tx';
import { tripleSpendTXFeePoolBSign } from '../../src/triple_endpoint/3server_sign';
import {
    tripleFeePoolLoadTx,
    tripleClientAFeePoolSpendTXUpdateSign
} from '../../src/triple_endpoint/4client_spend_tx_update';
import { tripleClientBFeePoolSpendTXUpdateSign } from '../../src/triple_endpoint/5server_sign_update';
import { tripleMergeFeePoolSigForSpendTx } from '../../src/triple_endpoint/0script';

import { readFileSync } from 'fs';

// 测试配置接口
interface TestConfig {
    fee_rate: number;
    end_height: number;
    sequence_2: number;
    new_client1_amount: number;
    final_locktime: number;
    final_sequence: number;
    client1_priv_hex: string;
    client2_priv_hex: string;
    server_priv_hex: string;
    fixed_utxo: {
        txid: string;
        vout: number;
        value: number;
    };
}

// 加载测试配置
function loadTestConfig(): { config: TestConfig; expectedOutputs: Record<string, string> } {
    // 加载测试配置
    const configData = readFileSync(__dirname + '/test_config.json', 'utf8');
    const config: TestConfig = JSON.parse(configData);

    // 加载预期输出
    const expectedData = readFileSync(__dirname + '/expected_outputs.json', 'utf8');
    const expectedOutputs: Record<string, string> = JSON.parse(expectedData);

    return { config, expectedOutputs };
}





export async function testTripleEndpointFixedUTXO(): Promise<void> {
    try {
        // 加载测试配置
        const { config, expectedOutputs } = loadTestConfig();
        
        // 错误计数器
        let errorCount = 0;

        // 初始化私钥
        const client1Priv = PrivateKey.fromString(config.client1_priv_hex, 16);
        const client2Priv = PrivateKey.fromString(config.client2_priv_hex, 16);
        const serverPriv = PrivateKey.fromString(config.server_priv_hex, 16);

        // 获取公钥和地址
        const client1PubKey = client1Priv.toPublicKey();
        const client2PubKey = client2Priv.toPublicKey();
        const serverPubKey = serverPriv.toPublicKey();

        const client1Address = client1PubKey.toAddress('testnet');
        const client2Address = client2PubKey.toAddress('testnet');
        const serverAddress = serverPubKey.toAddress('testnet');

        console.log(`Client1 Private Key: ${config.client1_priv_hex}`);
        console.log(`Client2 Private Key: ${config.client2_priv_hex}`);
        console.log(`Server Private Key: ${config.server_priv_hex}`);
        console.log(`Client1 Address: ${client1Address}`);
        console.log(`Client2 Address: ${client2Address}`);
        console.log(`Server Address: ${serverAddress}`);
        console.log(`Current Block Height: 1687373`);
        console.log(`End Height: ${config.end_height}`);

        // 使用配置中的固定 UTXO
        const fixedUTXO: UTXO = {
            txid: config.fixed_utxo.txid,
            vout: config.fixed_utxo.vout,
            satoshis: config.fixed_utxo.value
        };
        const client1UTXOs = [fixedUTXO];
        console.log(`\nFound 1 UTXOs for client1:`);
        console.log(`UTXO 0: ${fixedUTXO.txid}:${fixedUTXO.vout} (${fixedUTXO.satoshis} satoshis)`);
        console.log(`Total Value: ${fixedUTXO.satoshis} satoshis`);

        // Step 1: 创建基础交易
        console.log("\n" + "=".repeat(60));
        console.log("STEP 1: Creating Base Transaction (Client1 UTXO -> Triple Multisig)");
        console.log("=".repeat(60));

        const res1 = await tripleBuildFeePoolBaseTx(
            client1UTXOs,
            serverPubKey,
            client1Priv,
            client2PubKey,
            config.fee_rate
        );

        const baseTxHex = res1.tx.toHex();
        console.log(`=== STEP 1 - BASE TRANSACTION ===`);
        console.log(`Converts client1 UTXOs to 2-of-3 multisig output\nMultisig Amount: ${res1.amount} satoshis`);
        console.log(`TX Hex: ${baseTxHex}`);
        console.log(`Length: ${baseTxHex.length / 2} bytes`);
        console.log("---");

        // 验证基础交易（如果预期输出存在）
        if (expectedOutputs.base_tx && baseTxHex !== expectedOutputs.base_tx) {
            console.error("Base transaction mismatch.");
            console.error(`Expected: ${expectedOutputs.base_tx}`);
            console.error(`Got:      ${baseTxHex}`);
            errorCount++;
        }

        // Step 2: 构建花费交易
        console.log("\n" + "=".repeat(60));
        console.log("STEP 2: Build Spend Transaction (Client1 -> Client2, Server as Arbitrator)");
        console.log("=".repeat(60));

        const spendResult = await tripleBuildFeePoolSpendTX(
            res1.tx.id('hex'),
            res1.amount,
            config.end_height,
            serverPubKey,
            client1Priv,
            client2PubKey,
            config.fee_rate
        );

        const client1Amount = spendResult.amount;
        const client2Amount = res1.amount - client1Amount;
        console.log(`Client1 Amount (after fee): ${client1Amount} satoshis`);
        console.log(`Client2 Amount: ${client2Amount} satoshis`);
        console.log(`Server Role: Arbitrator (no funds allocated)`);

        const spendTxUnsignedHex = spendResult.tx.toHex();
        console.log(`=== STEP 2 - SPEND TRANSACTION (UNSIGNED) ===`);
        console.log(`Spends multisig: client1 (${client1Amount} sats), client2 (${client2Amount} sats)\nServer acts as arbitrator\nLocktime: ${config.end_height}`);
        console.log(`TX Hex: ${spendTxUnsignedHex}`);
        console.log(`Length: ${spendTxUnsignedHex.length / 2} bytes`);
        console.log("---");

        // Step 3: Client1 签名（已在 BuildTripleFeePoolSpendTX 中完成）
        console.log("\n" + "=".repeat(60));
        console.log("STEP 3: Client1 Sign (from BuildTripleFeePoolSpendTX)");
        console.log("=".repeat(60));

        const client1SigHex = spendResult.clientSignBytes.toString('hex');
        console.log(`Client1 Signature: ${client1SigHex}`);

        // 验证 client1 签名（如果预期输出存在）
        if (expectedOutputs.client1_signature && client1SigHex !== expectedOutputs.client1_signature) {
            console.error("Client1 signature mismatch.");
            console.error(`Expected: ${expectedOutputs.client1_signature}`);
            console.error(`Got:      ${client1SigHex}`);
            errorCount++;
        }

        // Step 4: Server 签名
        console.log("\n" + "=".repeat(60));
        console.log("STEP 4: Server Sign");
        console.log("=".repeat(60));

        const serverSignBytes = await tripleSpendTXFeePoolBSign(
            spendResult.tx,
            res1.amount,
            serverPubKey,
            client1PubKey,
            client2PubKey,
            client2Priv
        );

        const serverSigHex = serverSignBytes.toString('hex');
        console.log(`Server Signature: ${serverSigHex}`);

        // 验证 server 签名（如果预期输出存在）
        if (expectedOutputs.server_signature && serverSigHex !== expectedOutputs.server_signature) {
            console.error("Server signature mismatch.");
            console.error(`Expected: ${expectedOutputs.server_signature}`);
            console.error(`Got:      ${serverSigHex}`);
            errorCount++;
        }

        // 合并签名创建完整的花费交易
        const bTx = tripleMergeFeePoolSigForSpendTx(spendResult.tx, spendResult.clientSignBytes, serverSignBytes);

        const completeSpendTxHex = bTx.toHex();
        console.log(`=== STEP 4 - COMPLETE SPEND TRANSACTION ===`);
        console.log(`Fully signed transaction (client1 + server) ready for broadcast`);
        console.log(`TX Hex: ${completeSpendTxHex}`);
        console.log(`Length: ${completeSpendTxHex.length / 2} bytes`);
        console.log("---");

        // 验证完整花费交易（如果预期输出存在）
        if (expectedOutputs.complete_spend_tx && completeSpendTxHex !== expectedOutputs.complete_spend_tx) {
            console.error("Complete spend transaction mismatch.");
            console.error(`Expected: ${expectedOutputs.complete_spend_tx}`);
            console.error(`Got:      ${completeSpendTxHex}`);
            errorCount++;
        }

        // Step 5: Client1 更新签名
        console.log("\n" + "=".repeat(60));
        console.log("STEP 5: Client1 Update Sign (Adjust Client1-Client2 Distribution)");
        console.log("=".repeat(60));

        const updatedTx = await tripleFeePoolLoadTx(
            bTx,
            serverPubKey,
            client1PubKey,
            client2PubKey,
            res1.amount,
            undefined,
            config.sequence_2,
            config.new_client1_amount
        );

        const client1UpdateSignBytes = await tripleClientAFeePoolSpendTXUpdateSign(
            updatedTx,
            serverPubKey,
            client1Priv,
            client2PubKey
        );

        const newClient2Amount = res1.amount - config.new_client1_amount;
        const client1UpdateSigHex = client1UpdateSignBytes.toString('hex');
        console.log(`Client1 Update Signature: ${client1UpdateSigHex}`);
        console.log(`New Client1 Amount: ${config.new_client1_amount} satoshis`);
        console.log(`New Client2 Amount: ${newClient2Amount} satoshis`);
        console.log(`Server Role: Arbitrator (unchanged)`);
        console.log(`New Sequence Number: ${config.sequence_2}`);

        const updatedTxUnsignedHex = updatedTx.toHex();
        console.log(`=== STEP 5 - UPDATED TRANSACTION (UNSIGNED) ===`);
        console.log(`Updated distribution - Client1: ${config.new_client1_amount} sats, Client2: ${newClient2Amount} sats, Sequence: ${config.sequence_2}`);
        console.log(`TX Hex: ${updatedTxUnsignedHex}`);
        console.log(`Length: ${updatedTxUnsignedHex.length / 2} bytes`);
        console.log("---");

        // 验证 client1 更新签名（如果预期输出存在）
        if (expectedOutputs.client1_update_signature && client1UpdateSigHex !== expectedOutputs.client1_update_signature) {
            console.error("Client1 update signature mismatch.");
            console.error(`Expected: ${expectedOutputs.client1_update_signature}`);
            console.error(`Got:      ${client1UpdateSigHex}`);
            errorCount++;
        }

        // Step 6: Client2 同意并签名
        console.log("\n" + "=".repeat(60));
        console.log("STEP 6: Client2 Agrees and Signs (Normal Negotiation)");
        console.log("=".repeat(60));

        const client2UpdateSignBytes = await tripleClientBFeePoolSpendTXUpdateSign(
            updatedTx,
            serverPubKey,
            client1PubKey,
            client2Priv
        );

        const client2UpdateSigHex = client2UpdateSignBytes.toString('hex');
        console.log(`Client2 Update Signature: ${client2UpdateSigHex}`);

        // 验证 client2 更新签名（如果预期输出存在）
        if (expectedOutputs.client2_update_signature && client2UpdateSigHex !== expectedOutputs.client2_update_signature) {
            console.error("Client2 update signature mismatch.");
            console.error(`Expected: ${expectedOutputs.client2_update_signature}`);
            console.error(`Got:      ${client2UpdateSigHex}`);
            errorCount++;
        }

        // 合并更新签名
        const completeUpdatedTx = tripleMergeFeePoolSigForSpendTx(updatedTx, client1UpdateSignBytes, client2UpdateSignBytes);

        const completeUpdatedTxHex = completeUpdatedTx.toHex();
        console.log(`=== STEP 6 - COMPLETE UPDATED TRANSACTION ===`);
        console.log(`Client1 + Client2 协商完成的交易，可以广播`);
        console.log(`TX Hex: ${completeUpdatedTxHex}`);
        console.log(`Length: ${completeUpdatedTxHex.length / 2} bytes`);
        console.log("---");

        // 验证完整更新交易（如果预期输出存在）
        if (expectedOutputs.complete_updated_tx && completeUpdatedTxHex !== expectedOutputs.complete_updated_tx) {
            console.error("Complete updated transaction mismatch.");
            console.error(`Expected: ${expectedOutputs.complete_updated_tx}`);
            console.error(`Got:      ${completeUpdatedTxHex}`);
            errorCount++;
        }

        // 最终步骤：关闭费用池
        console.log("\n" + "=".repeat(60));
        console.log("FINAL STEP: Close Fee Pool (locktime=0xffffffff, sequence=0xffffffff)");
        console.log("=".repeat(60));

        const finalTx = await tripleFeePoolLoadTx(
            bTx,
            serverPubKey,
            client1PubKey,
            client2PubKey,
            res1.amount,
            config.final_locktime,
            config.final_sequence,
            config.new_client1_amount
        );

        // Client1 最终签名
        const client1FinalSignBytes = await tripleClientAFeePoolSpendTXUpdateSign(
            finalTx,
            serverPubKey,
            client1Priv,
            client2PubKey
        );

        // Server 最终签名 (实际上是 client2 签名，与 Go 版本保持一致)
        const serverFinalSignBytes = await tripleSpendTXFeePoolBSign(
            finalTx,
            res1.amount,
            serverPubKey,
            client1PubKey,
            client2PubKey,
            client2Priv
        );

        // 合并最终签名
        const finalClosedTx = tripleMergeFeePoolSigForSpendTx(finalTx, client1FinalSignBytes, serverFinalSignBytes);

        const client1FinalSigHex = client1FinalSignBytes.toString('hex');
        const serverFinalSigHex = serverFinalSignBytes.toString('hex');
        console.log(`Client1 Final Signature: ${client1FinalSigHex}`);
        console.log(`Server Final Signature: ${serverFinalSigHex}`);
        console.log(`Final Locktime: 0x${config.final_locktime.toString(16)}`);
        console.log(`Final Sequence: 0x${config.final_sequence.toString(16)}`);

        const finalClosedTxHex = finalClosedTx.toHex();
        console.log(`=== FINAL - CLOSED FEE POOL TRANSACTION ===`);
        console.log(`Fee pool closed - can be broadcast immediately without time locks`);
        console.log(`TX Hex: ${finalClosedTxHex}`);
        console.log(`Length: ${finalClosedTxHex.length / 2} bytes`);
        console.log("---");

        // 验证最终签名和交易（如果预期输出存在）
        if (expectedOutputs.client1_final_signature && client1FinalSigHex !== expectedOutputs.client1_final_signature) {
            console.error("Client1 final signature mismatch.");
            console.error(`Expected: ${expectedOutputs.client1_final_signature}`);
            console.error(`Got:      ${client1FinalSigHex}`);
            errorCount++;
        }

        if (expectedOutputs.server_final_signature && serverFinalSigHex !== expectedOutputs.server_final_signature) {
            console.error("Server final signature mismatch.");
            console.error(`Expected: ${expectedOutputs.server_final_signature}`);
            console.error(`Got:      ${serverFinalSigHex}`);
            errorCount++;
        }

        if (expectedOutputs.final_closed_tx && finalClosedTxHex !== expectedOutputs.final_closed_tx) {
            console.error("Final closed transaction mismatch.");
            console.error(`Expected: ${expectedOutputs.final_closed_tx}`);
            console.error(`Got:      ${finalClosedTxHex}`);
            errorCount++;
        }

        // 总结
        console.log("\n" + "=".repeat(60));
        console.log("SUMMARY - TRANSACTION SEQUENCE");
        console.log("=".repeat(60));
        console.log(`1. Base TX (Step 1):     ${res1.tx.id('hex')}`);
        console.log(`2. Spend TX (Step 4):    ${bTx.id('hex')}`);
        console.log(`3. Updated TX (Step 6):  ${completeUpdatedTx.id('hex')}`);
        console.log(`4. Final TX (Closed):    ${finalClosedTx.id('hex')}`);
        console.log();
        console.log(`Client1 Final Amount: ${config.new_client1_amount} satoshis`);
        console.log(`Client2 Final Amount: ${newClient2Amount} satoshis`);
        console.log(`Server Role: Arbitrator (no funds)`);
        console.log();
        console.log("BROADCAST ORDER:");
        console.log("1. First broadcast the Base Transaction (Step 1)");
        console.log("2. Wait for confirmation");
        console.log("3. Then broadcast the Final Transaction");
        console.log();
        console.log("TESTNET EXPLORER:");
        console.log("https://test.whatsonchain.com/");

        // 检查是否有错误
        if (errorCount > 0) {
            console.log(`\n❌ Test failed with ${errorCount} mismatches!`);
            throw new Error(`Test failed with ${errorCount} mismatches`);
        } else {
            console.log("\n✅ All transaction outputs match expected values from successful test run!");
        }

    } catch (error) {
        console.error("Test failed:", error);
        throw error;
    }
}

// 运行测试
async function main() {
    try {
        await testTripleEndpointFixedUTXO();
        console.log("Test passed successfully!");
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    main();
}

// Export main if needed
export { main };
