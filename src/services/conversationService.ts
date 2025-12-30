import { query } from "../db/client.js";

/**
 * Conversation Service
 * Manages conversations and sessions for grouping multi-turn conversations
 */
export class ConversationService {
  /**
   * Get or create a conversation
   */
  static async getOrCreate(params: {
    conversationId: string;
    tenantId: string;
    projectId: string;
    userId?: string;
  }): Promise<{
    id: string;
    conversation_id: string;
    tenant_id: string;
    project_id: string;
    user_id: string | null;
    started_at: Date;
    last_message_at: Date;
    message_count: number;
    total_tokens: number;
    total_cost: number;
    has_issues: boolean;
  }> {
    const { conversationId, tenantId, projectId, userId } = params;

    // Try to get existing conversation
    const existing = await query(
      `SELECT * FROM conversations 
       WHERE conversation_id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );

    if (existing.length > 0) {
      return existing[0] as any;
    }

    // Create new conversation
    const result = await query(
      `INSERT INTO conversations (
        conversation_id, tenant_id, project_id, user_id, 
        started_at, last_message_at, message_count, 
        total_tokens, total_cost, has_issues
      ) VALUES ($1, $2, $3, $4, NOW(), NOW(), 0, 0, 0, FALSE)
      RETURNING *`,
      [conversationId, tenantId, projectId, userId || null]
    );

    return result[0] as any;
  }

  /**
   * Update conversation metrics when a new message is added
   */
  static async updateConversationMetrics(params: {
    conversationId: string;
    tenantId: string;
    tokensTotal?: number | null;
    cost?: number;
    hasIssues?: boolean;
  }): Promise<void> {
    const { conversationId, tenantId, tokensTotal, cost, hasIssues } = params;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    updates.push("message_count = message_count + 1");
    updates.push("last_message_at = NOW()");
    updates.push("updated_at = NOW()");

    if (tokensTotal !== null && tokensTotal !== undefined) {
      updates.push(`total_tokens = total_tokens + $${paramIndex}`);
      values.push(tokensTotal);
      paramIndex++;
    }

    if (cost !== undefined && cost !== null) {
      updates.push(`total_cost = total_cost + $${paramIndex}`);
      values.push(cost);
      paramIndex++;
    }

    if (hasIssues !== undefined) {
      updates.push(`has_issues = has_issues OR $${paramIndex}`);
      values.push(hasIssues);
      paramIndex++;
    }

    values.push(conversationId, tenantId);

    await query(
      `UPDATE conversations 
       SET ${updates.join(", ")}
       WHERE conversation_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      values
    );
  }

  /**
   * Get or create a user session
   */
  static async getOrCreateSession(params: {
    sessionId: string;
    tenantId: string;
    projectId: string;
    userId?: string;
    conversationId?: string;
  }): Promise<{
    id: string;
    session_id: string;
    conversation_id: string | null;
    tenant_id: string;
    project_id: string;
    user_id: string | null;
    started_at: Date;
    ended_at: Date | null;
    message_count: number;
  }> {
    const { sessionId, tenantId, projectId, userId, conversationId } = params;

    // Try to get existing session
    const existing = await query(
      `SELECT * FROM user_sessions 
       WHERE session_id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );

    if (existing.length > 0) {
      return existing[0] as any;
    }

    // Create new session
    const result = await query(
      `INSERT INTO user_sessions (
        session_id, conversation_id, tenant_id, project_id, 
        user_id, started_at, message_count
      ) VALUES ($1, $2, $3, $4, $5, NOW(), 0)
      RETURNING *`,
      [sessionId, conversationId || null, tenantId, projectId, userId || null]
    );

    return result[0] as any;
  }

  /**
   * Update session metrics
   */
  static async updateSessionMetrics(params: {
    sessionId: string;
    tenantId: string;
  }): Promise<void> {
    const { sessionId, tenantId } = params;

    await query(
      `UPDATE user_sessions 
       SET message_count = message_count + 1
       WHERE session_id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );
  }

  /**
   * Get conversation by ID
   */
  static async getConversation(
    conversationId: string,
    tenantId: string
  ): Promise<any | null> {
    const result = await query(
      `SELECT * FROM conversations 
       WHERE conversation_id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get all messages in a conversation
   */
  static async getConversationMessages(
    conversationId: string,
    tenantId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationService.ts:192',message:'Before querying conversation messages',data:{conversationId:conversationId?.substring(0,20),tenantId,limit,offset},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    const result = await query(
      `SELECT * FROM analysis_results 
       WHERE conversation_id = $1 AND tenant_id = $2
       ORDER BY message_index ASC, timestamp ASC
       LIMIT $3 OFFSET $4`,
      [conversationId, tenantId, limit, offset]
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/431a9fa4-96bd-46c7-8321-5ccac542c2c3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationService.ts:200',message:'After querying conversation messages',data:{conversationId:conversationId?.substring(0,20),messageCount:result.length,traceIds:result.map((r:any)=>r.trace_id?.substring(0,20)),messageIndexes:result.map((r:any)=>r.message_index),queries:result.map((r:any)=>r.query?.substring(0,30))},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.log(
      `[ConversationService] Found ${result.length} messages for conversation ${conversationId?.substring(0, 20)}...`
    );
    if (result.length > 0) {
      console.log(
        `[ConversationService] Message indexes:`,
        result.map((r: any) => r.message_index)
      );
    }

    return result;
  }

  /**
   * Get conversation analytics
   */
  static async getConversationAnalytics(
    conversationId: string,
    tenantId: string
  ): Promise<{
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
    averageLatency: number;
    issueCount: number;
    hallucinationRate: number;
    contextDropRate: number;
    faithfulnessIssueRate: number;
  }> {
    const conversation = await this.getConversation(conversationId, tenantId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const messages = await query(
      `SELECT 
        COUNT(*) as total_messages,
        SUM(tokens_total) as total_tokens,
        AVG(latency_ms) as avg_latency,
        COUNT(*) FILTER (WHERE is_hallucination = TRUE) as hallucination_count,
        COUNT(*) FILTER (WHERE has_context_drop = TRUE) as context_drop_count,
        COUNT(*) FILTER (WHERE has_faithfulness_issue = TRUE) as faithfulness_count,
        COUNT(*) FILTER (
          WHERE is_hallucination = TRUE 
          OR has_context_drop = TRUE 
          OR has_faithfulness_issue = TRUE
        ) as issue_count
       FROM analysis_results 
       WHERE conversation_id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );

    const stats = messages[0] as any;
    const totalMessages = parseInt(stats.total_messages || "0", 10);

    return {
      totalMessages,
      totalTokens: parseInt(stats.total_tokens || "0", 10),
      totalCost: parseFloat(conversation.total_cost || "0"),
      averageLatency: parseFloat(stats.avg_latency || "0"),
      issueCount: parseInt(stats.issue_count || "0", 10),
      hallucinationRate:
        totalMessages > 0
          ? (parseInt(stats.hallucination_count || "0", 10) / totalMessages) * 100
          : 0,
      contextDropRate:
        totalMessages > 0
          ? (parseInt(stats.context_drop_count || "0", 10) / totalMessages) * 100
          : 0,
      faithfulnessIssueRate:
        totalMessages > 0
          ? (parseInt(stats.faithfulness_count || "0", 10) / totalMessages) * 100
          : 0,
    };
  }

  /**
   * List conversations with filters
   */
  static async listConversations(params: {
    tenantId: string;
    projectId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
    hasIssues?: boolean;
  }): Promise<{
    conversations: any[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }> {
    const {
      tenantId,
      projectId,
      userId,
      limit = 50,
      offset = 0,
      hasIssues,
    } = params;

    let whereClause = "WHERE tenant_id = $1";
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND project_id = $${paramIndex}`;
      values.push(projectId);
      paramIndex++;
    }

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      values.push(userId);
      paramIndex++;
    }

    if (hasIssues !== undefined) {
      whereClause += ` AND has_issues = $${paramIndex}`;
      values.push(hasIssues);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM conversations ${whereClause}`,
      values
    );
    const total = parseInt(countResult[0].total, 10);

    // Get conversations
    const conversations = await query(
      `SELECT * FROM conversations 
       ${whereClause}
       ORDER BY last_message_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      conversations: conversations as any[],
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }
}

