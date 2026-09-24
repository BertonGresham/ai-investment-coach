import React, { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const AI_SERVICE_URL =
  process.env.EXPO_PUBLIC_AI_SERVICE_URL || "http://localhost:8001";

type TradeForm = {
  symbol: string;
  buyTime: string;
  sellTime: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  buyReason: string;
  sellReason: string;
  klineSummary: string;
};

function toLocalDateTimeInput(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function createInitialForm(): TradeForm {
  const now = new Date();
  return {
    symbol: "AAPL",
    buyTime: toLocalDateTimeInput(new Date(now.getTime() - 3 * 60 * 60 * 1000)),
    sellTime: toLocalDateTimeInput(new Date(now.getTime() - 60 * 60 * 1000)),
    buyPrice: "218.5",
    sellPrice: "213.2",
    quantity: "10",
    buyReason: "看到价格快速上涨，担心错过机会，所以买入",
    sellReason: "下跌后害怕继续亏损，所以卖出",
    klineSummary: "买入前连续3根阳线，买入后出现长上影线，随后回落",
  };
}

type TradeAnalysis = {
  trade_id: string;
  trade_time: string;
  analysis_type: "single_trade_behavior_analysis";
  behavior_summary: string;
  detected_behavior_problems: Array<{
    problem_code: string;
    problem_name: string;
    severity: "low" | "medium" | "high";
    evidence: string;
    explanation: string;
    theory_reference: string | null;
  }>;
  personality_tags: Array<{
    tag_code: string;
    tag_name: string;
    confidence: number;
  }>;
  coaching_advice: string[];
  reflection_questions: string[];
  risk_notice: string;
  uncertainty: {
    level: "low" | "medium" | "high";
    reason: string;
  };
};

type ProfileWindow = {
  period: string;
  days: number;
  sample_count: number;
  confidence_level: "low" | "medium" | "high";
  dominant_tags: Array<{
    code: string;
    name: string;
    occurrences: number;
    frequency: number;
  }>;
  recurring_problems: Array<{
    code: string;
    name: string;
    occurrences: number;
    frequency: number;
  }>;
  summary: string;
};

type InvestmentProfile = {
  as_of: string;
  short_term: ProfileWindow;
  medium_term: ProfileWindow;
  long_term: ProfileWindow;
  limitation: string;
};

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
};

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  keyboardType = "default",
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

function severityLabel(severity: string) {
  if (severity === "high") return "较明显";
  if (severity === "medium") return "留意";
  return "线索";
}

function confidenceLabel(confidence: string) {
  if (confidence === "high") return "样本较多";
  if (confidence === "medium") return "样本一般";
  return "样本较少";
}

export default function App() {
  const [form, setForm] = useState<TradeForm>(createInitialForm);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TradeAnalysis | null>(null);
  const [history, setHistory] = useState<TradeAnalysis[]>([]);
  const [profile, setProfile] = useState<InvestmentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof TradeForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function runAnalysis() {
    const buyPrice = Number(form.buyPrice);
    const sellPrice = form.sellPrice.trim() ? Number(form.sellPrice) : null;
    const quantity = Number(form.quantity);
    const buyTimestamp = Date.parse(form.buyTime);
    const sellTimestamp = form.sellTime.trim() ? Date.parse(form.sellTime) : null;
    if (!form.buyReason.trim()) {
      setError("请填写买入理由，便于复盘决策过程。");
      return;
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      setError("请填写有效的买入价格和股数。");
      return;
    }
    if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice <= 0)) {
      setError("卖出价格必须是大于 0 的数字。");
      return;
    }
    if (!Number.isFinite(buyTimestamp)) {
      setError("请填写有效的买入时间。");
      return;
    }
    if ((sellTimestamp === null) !== (sellPrice === null)) {
      setError("卖出时间和卖出价格需要同时填写，或同时留空。");
      return;
    }
    if (sellTimestamp !== null && (!Number.isFinite(sellTimestamp) || sellTimestamp < buyTimestamp)) {
      setError("卖出时间不能早于买入时间。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const profitLoss =
        sellPrice === null ? null : Number(((sellPrice - buyPrice) * quantity).toFixed(2));
      const profitLossRate =
        sellPrice === null ? null : Number(((sellPrice - buyPrice) / buyPrice).toFixed(6));
      const tradeId = "demo-" + Date.now();
      const response = await fetch(AI_SERVICE_URL + "/analyze-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "demo_user",
          trade_id: tradeId,
          stock: { symbol: form.symbol.trim() || "UNKNOWN", market: "US" },
          trade: {
            buy_time: new Date(buyTimestamp).toISOString(),
            sell_time: sellTimestamp === null ? null : new Date(sellTimestamp).toISOString(),
            buy_price: buyPrice,
            sell_price: sellPrice,
            quantity,
            profit_loss_amount: profitLoss,
            profit_loss_rate: profitLossRate,
          },
          decision: {
            buy_reason: form.buyReason,
            sell_reason: form.sellReason || null,
            planned_holding_period: "当日短线",
          },
          market_snapshot: { kline_summary: form.klineSummary },
          analysis_context: {
            language: "zh-CN",
            analysis_goal: "分析用户本次交易中的决策行为，而不是预测股价",
            risk_notice_required: true,
          },
          rag_context: [],
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.detail || "AI 服务返回错误：" + response.status);
      }
      const result: TradeAnalysis = await response.json();
      setAnalysis(result);
      setHistory((current) => [result, ...current].slice(0, 100));
      setProfile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 服务连接失败");
    } finally {
      setLoading(false);
    }
  }

  async function runProfileAnalysis() {
    if (history.length === 0) return;
    setProfileLoading(true);
    setError(null);
    try {
      const response = await fetch(AI_SERVICE_URL + "/analyze-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "demo_user",
          trade_analyses: history,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.detail || "画像生成失败：" + response.status);
      }
      setProfile(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像服务连接失败");
    } finally {
      setProfileLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>AI INVESTMENT COACH</Text>
          <Text style={styles.title}>交易复盘</Text>
          <Text style={styles.subtitle}>看清决策习惯，让每笔交易都留下可学习的经验。</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>交易记录</Text>
          <View style={styles.grid}>
            <View style={styles.halfField}>
              <Field label="股票代码" value={form.symbol} onChangeText={(v) => updateField("symbol", v)} />
            </View>
            <View style={styles.halfField}>
              <Field label="股数" value={form.quantity} keyboardType="number-pad" onChangeText={(v) => updateField("quantity", v)} />
            </View>
            <View style={styles.halfField}>
              <Field label="买入时间" value={form.buyTime} onChangeText={(v) => updateField("buyTime", v)} />
            </View>
            <View style={styles.halfField}>
              <Field label="卖出时间" value={form.sellTime} onChangeText={(v) => updateField("sellTime", v)} />
            </View>
            <View style={styles.halfField}>
              <Field label="买入价格" value={form.buyPrice} keyboardType="decimal-pad" onChangeText={(v) => updateField("buyPrice", v)} />
            </View>
            <View style={styles.halfField}>
              <Field label="卖出价格" value={form.sellPrice} keyboardType="decimal-pad" onChangeText={(v) => updateField("sellPrice", v)} />
            </View>
          </View>
          <Field label="买入理由" value={form.buyReason} multiline onChangeText={(v) => updateField("buyReason", v)} />
          <Field label="卖出理由" value={form.sellReason} multiline onChangeText={(v) => updateField("sellReason", v)} />
          <Field label="K 线摘要" value={form.klineSummary} multiline onChangeText={(v) => updateField("klineSummary", v)} />
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={runAnalysis}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>分析这笔交易</Text>}
          </TouchableOpacity>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>

        {analysis && (
          <View style={styles.section}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.sectionTitle}>行为复盘</Text>
                <Text style={styles.muted}>{analysis.trade_time}</Text>
              </View>
              <Text style={styles.sampleBadge}>单笔样本</Text>
            </View>
            <Text style={styles.summary}>{analysis.behavior_summary}</Text>
            <Text style={styles.sectionLabel}>观察到的线索</Text>
            {analysis.detected_behavior_problems.map((problem) => (
              <View key={problem.problem_code} style={styles.problem}>
                <View style={styles.problemHeading}>
                  <Text style={styles.problemTitle}>{problem.problem_name}</Text>
                  <Text style={[styles.severity, problem.severity === "high" && styles.highSeverity]}>
                    {severityLabel(problem.severity)}
                  </Text>
                </View>
                <Text style={styles.evidence}>依据：{problem.evidence}</Text>
                <Text style={styles.body}>{problem.explanation}</Text>
                {problem.theory_reference ? (
                  <Text style={styles.reference}>理论参考：{problem.theory_reference}</Text>
                ) : null}
              </View>
            ))}

            <Text style={styles.sectionLabel}>本次行为标签</Text>
            <View style={styles.tags}>
              {analysis.personality_tags.length ? analysis.personality_tags.map((tag) => (
                <View key={tag.tag_code} style={styles.tag}>
                  <Text style={styles.tagText}>{tag.tag_name}</Text>
                  <Text style={styles.tagConfidence}>{Math.round(tag.confidence * 100)}% 线索强度</Text>
                </View>
              )) : <Text style={styles.muted}>暂未形成明确标签。</Text>}
            </View>

            <Text style={styles.sectionLabel}>下次可以尝试</Text>
            {analysis.coaching_advice.map((advice, index) => (
              <Text key={index} style={styles.listText}>{index + 1}. {advice}</Text>
            ))}
            <Text style={styles.sectionLabel}>复盘问题</Text>
            {analysis.reflection_questions.map((question, index) => (
              <Text key={index} style={styles.listText}>{index + 1}. {question}</Text>
            ))}
            <View style={styles.uncertainty}>
              <Text style={styles.uncertaintyTitle}>判断边界 · {confidenceLabel(analysis.uncertainty.level)}</Text>
              <Text style={styles.body}>{analysis.uncertainty.reason}</Text>
            </View>
            <Text style={styles.notice}>{analysis.risk_notice}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={runProfileAnalysis}
              disabled={profileLoading}
            >
              {profileLoading ? <ActivityIndicator color="#136f63" /> : <Text style={styles.secondaryButtonText}>根据已分析交易更新画像（{history.length}）</Text>}
            </TouchableOpacity>
          </View>
        )}

        {profile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>投资行为画像</Text>
            <Text style={styles.muted}>统计截至 {profile.as_of.slice(0, 10)}</Text>
            {[
              profile.short_term,
              profile.medium_term,
              profile.long_term,
            ].map((window) => (
              <View key={window.period} style={styles.profileWindow}>
                <View style={styles.problemHeading}>
                  <Text style={styles.profileTitle}>{window.days} 天观察</Text>
                  <Text style={styles.muted}>{window.sample_count} 笔 · {confidenceLabel(window.confidence_level)}</Text>
                </View>
                <Text style={styles.body}>{window.summary}</Text>
                {window.dominant_tags.map((tag) => (
                  <Text key={tag.code} style={styles.profilePattern}>
                    {tag.name} · {tag.occurrences}/{window.sample_count} 笔
                  </Text>
                ))}
              </View>
            ))}
            <Text style={styles.notice}>{profile.limitation}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f7f6" },
  page: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" },
  header: { paddingTop: 10, paddingBottom: 6 },
  eyebrow: { color: "#136f63", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#172b2a", fontSize: 28, fontWeight: "800", marginTop: 5 },
  subtitle: { color: "#586c69", fontSize: 14, lineHeight: 21, marginTop: 5 },
  section: { backgroundColor: "#ffffff", borderColor: "#dce7e4", borderWidth: 1, borderRadius: 8, padding: 16, gap: 12 },
  sectionTitle: { color: "#172b2a", fontSize: 19, fontWeight: "800" },
  sectionLabel: { color: "#253d39", fontSize: 14, fontWeight: "800", marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  halfField: { width: "48%", minWidth: 138, flexGrow: 1 },
  field: { gap: 5, marginBottom: 6 },
  label: { color: "#526663", fontSize: 12, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#d7e2df", borderRadius: 6, minHeight: 42, paddingHorizontal: 10, color: "#172b2a", fontSize: 14, backgroundColor: "#ffffff" },
  multilineInput: { minHeight: 72, paddingTop: 9, paddingBottom: 9 },
  primaryButton: { alignItems: "center", justifyContent: "center", backgroundColor: "#136f63", borderRadius: 6, minHeight: 46, marginTop: 4 },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secondaryButton: { alignItems: "center", justifyContent: "center", borderColor: "#136f63", borderWidth: 1, borderRadius: 6, minHeight: 44, marginTop: 4, paddingHorizontal: 10 },
  secondaryButtonText: { color: "#136f63", fontSize: 13, fontWeight: "800", textAlign: "center" },
  error: { color: "#b42318", fontSize: 13, lineHeight: 19 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  sampleBadge: { color: "#835b14", backgroundColor: "#fff4d6", overflow: "hidden", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  muted: { color: "#6b7b78", fontSize: 12, marginTop: 3 },
  summary: { color: "#172b2a", fontSize: 16, lineHeight: 24, fontWeight: "700" },
  problem: { borderLeftColor: "#db9b42", borderLeftWidth: 3, paddingLeft: 11, gap: 5, marginTop: 4 },
  problemHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  problemTitle: { color: "#172b2a", fontSize: 14, lineHeight: 20, fontWeight: "800", flex: 1 },
  severity: { color: "#835b14", fontSize: 11, fontWeight: "700" },
  highSeverity: { color: "#b42318" },
  evidence: { color: "#405652", fontSize: 13, lineHeight: 19 },
  body: { color: "#526663", fontSize: 13, lineHeight: 20 },
  reference: { color: "#136f63", fontSize: 12, lineHeight: 18 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderColor: "#c9e3dc", borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 },
  tagText: { color: "#155d53", fontSize: 13, fontWeight: "800" },
  tagConfidence: { color: "#61736f", fontSize: 10, marginTop: 3 },
  listText: { color: "#405652", fontSize: 13, lineHeight: 20 },
  uncertainty: { backgroundColor: "#f3f7f6", borderRadius: 6, padding: 11, gap: 4 },
  uncertaintyTitle: { color: "#405652", fontSize: 12, fontWeight: "800" },
  notice: { color: "#71807d", fontSize: 11, lineHeight: 17 },
  profileWindow: { borderTopColor: "#e4ece9", borderTopWidth: 1, paddingTop: 10, gap: 5 },
  profileTitle: { color: "#172b2a", fontSize: 14, fontWeight: "800" },
  profilePattern: { color: "#136f63", fontSize: 12, lineHeight: 18 },
});
