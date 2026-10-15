/**
 * IntelligenceProvider abstraction for Twiller Conversation Intelligence.
 * Isolates LLM interactions and enables 100% deterministic local/CI test coverage.
 */

export class IntelligenceProvider {
  /**
   * Generate structured conversation insights from root post and visible sources.
   * @param {Object} context
   * @param {Object} context.rootPost
   * @param {Array<Object>} context.sources
   * @param {Array<Object>} [context.topicContext]
   * @param {Object} [context.circleContext]
   * @returns {Promise<{ overview: string, keyPoints: Array, perspectives: Array }>}
   */
  async generateThreadInsight(_context) {
    throw new Error("generateThreadInsight must be implemented by concrete provider");
  }
}

export class MockIntelligenceProvider extends IntelligenceProvider {
  constructor(options = {}) {
    super();
    this.name = options.name || "mock-v1";
    this.overrideResult = options.overrideResult || null;
    this.shouldFail = options.shouldFail || false;
    this.failureError = options.failureError || new Error("Mock provider generation error");
  }

  setOverride(result) {
    this.overrideResult = result;
  }

  setFailure(shouldFail, error = null) {
    this.shouldFail = shouldFail;
    if (error) this.failureError = error;
  }

  async generateThreadInsight({ rootPost, sources = [], topicContext = [], circleContext = null }) {
    if (this.shouldFail) {
      throw this.failureError;
    }

    if (this.overrideResult) {
      return this.overrideResult;
    }

    const activeSources = sources.filter(s => !s.deletedAt && !s.deleted);
    if (!activeSources.length) {
      throw new Error("Cannot generate intelligence without active source replies");
    }

    const rootSnippet = (rootPost.content || "").slice(0, 100).trim();
    const overview = `Discussion analyzing "${rootSnippet}" across ${activeSources.length} contributions.`;

    // Group active sources into key points
    const keyPoints = [];
    const chunkSize = Math.max(1, Math.ceil(activeSources.length / 3));
    for (let i = 0; i < activeSources.length && keyPoints.length < 4; i += chunkSize) {
      const chunk = activeSources.slice(i, i + chunkSize);
      const chunkIds = chunk.map(s => String(s._id));
      const firstSourceSnippet = (chunk[0].content || "response").slice(0, 60).trim();
      keyPoints.push({
        statement: `Participants emphasize "${firstSourceSnippet}" and related follow-ups.`,
        sourcePostIds: chunkIds,
      });
    }

    // Generate perspectives from different halves of the thread
    const perspectives = [];
    const firstHalf = activeSources.slice(0, Math.ceil(activeSources.length / 2));
    const secondHalf = activeSources.slice(Math.ceil(activeSources.length / 2));

    if (firstHalf.length) {
      perspectives.push({
        viewpoint: `Initial respondents prioritize immediate practical implications of the topic.`,
        sourcePostIds: firstHalf.map(s => String(s._id)),
      });
    }

    if (secondHalf.length) {
      perspectives.push({
        viewpoint: `Later replies examine secondary consequences and trade-offs.`,
        sourcePostIds: secondHalf.map(s => String(s._id)),
      });
    } else if (firstHalf.length) {
      perspectives.push({
        viewpoint: `Consensus centers on the initial framing without notable dissent.`,
        sourcePostIds: [String(firstHalf[0]._id)],
      });
    }

    return {
      overview,
      keyPoints,
      perspectives,
      model: this.name,
    };
  }
}
