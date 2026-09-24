import React, { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const AI_SERVICE_URL =
  process.env.EXPO_PUBLIC_AI_SERVICE_URL || "http://localhost:8001";

const sampleTrade = {
  user_id: "user_001",
  trade_id: "trade_20250725_001",
  stock: {
    symbol: "AAPL",
    name: "Apple Inc.",
    market: "US",
  },
  trade: {
    buy_time: "2025-07-25T10:15:00",
    sell_time: "2025-07-25T14:40:00",
    buy_price: 218.5,
    sell_price: 213.2,
    quantity: 10,
    profit_loss_amount: -53.0,
    profit_loss_rate: -0.0243,
  },
  decision: {
    buy_reason: "看到价格快速上涨，担心错过机会，所以买入",
    sell_reason: "下跌后害怕继续亏损，所以卖出",
    confidence_level: 4,
    planned_holding_period: "当日短线",
    actual_holding_period_minutes: 265,
  },
  market_snapshot: {
    trend_before_buy: "开盘后快速拉升，短时间涨幅较大",
    volume_price_summary: "价格上涨同时成交量放大，但随后出现放量滞涨",
    kline_summary: "买入前连续3根阳线，买入后出现长上影线，随后回落",
    news_summary: "无重大利好公告",
  },
  analysis_context: {
    language: "zh-CN",
    analysis_goal: "分析用户本次交易中的决策行为问题，而不是预测股票未来走势",
    risk_notice_required: true,
  },
  rag_context: [],
};

type AnalysisResult = {
  behavior_summary: string;
  detected_behavior_problems: Array<{
    problem_name: string;
    severity: string;
    explanation: string;
  }>;
  personality_tags: Array<{
    tag_name: string;
    confidence: number;
  }>;
  coaching_advice: string[];
  risk_notice: string;
};

export default function App() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSampleAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${AI_SERVICE_URL}/analyze-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTrade),
      });

      if (!response.ok) {
        throw new Error(`AI服务返回错误：${response.status}`);
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI服务连接失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>AI投资教练</Text>
        <Text style={styles.subtitle}>分析你的投资决策行为，而不是预测股票涨跌。</Text>

        <View style={styles.flow}>
          {["每日学习", "获得积分", "模拟交易", "AI复盘"].map((item, index) => (
            <View key={item} style={styles.step}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>模拟交易样例</Text>
          <Text style={styles.body}>股票：AAPL</Text>
          <Text style={styles.body}>买入理由：看到价格快速上涨，担心错过机会</Text>
          <Text style={styles.body}>卖出理由：下跌后害怕继续亏损</Text>
          <TouchableOpacity style={styles.button} onPress={runSampleAnalysis} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "分析中..." : "运行AI行为分析"}</Text>
          </TouchableOpacity>
          {loading && <ActivityIndicator style={styles.loading} />}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        {analysis && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>AI分析结果</Text>
            <Text style={styles.summary}>{analysis.behavior_summary}</Text>

            <Text style={styles.sectionTitle}>行为问题</Text>
            {analysis.detected_behavior_problems.map((problem) => (
              <View key={problem.problem_name} style={styles.item}>
                <Text style={styles.itemTitle}>{problem.problem_name}</Text>
                <Text style={styles.body}>{problem.explanation}</Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>性格标签</Text>
            <View style={styles.tags}>
              {analysis.personality_tags.map((tag) => (
                <View key={tag.tag_name} style={styles.tag}>
                  <Text style={styles.tagText}>{tag.tag_name}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>复盘建议</Text>
            {analysis.coaching_advice.map((advice) => (
              <Text key={advice} style={styles.body}>- {advice}</Text>
            ))}

            <Text style={styles.notice}>{analysis.risk_notice}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  page: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#4b5563",
    fontSize: 15,
    lineHeight: 22,
  },
  flow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  step: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    width: "47%",
  },
  stepNumber: {
    color: "#2563eb",
    fontSize: 18,
    fontWeight: "800",
  },
  stepText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  body: {
    color: "#374151",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  loading: {
    marginTop: 12,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginTop: 12,
  },
  summary: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 16,
  },
  item: {
    borderLeftColor: "#2563eb",
    borderLeftWidth: 3,
    marginTop: 10,
    paddingLeft: 10,
  },
  itemTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  tag: {
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: "#075985",
    fontSize: 13,
    fontWeight: "700",
  },
  notice: {
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
});

