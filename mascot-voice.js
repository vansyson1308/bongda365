// Mascot Voice Engine - "Ngựa Tiên Tri" personality system
// 3 modes: serious (nghiêm túc), troll (dí dỏm), expert (chuyên gia)

class MascotVoice {
  constructor() {
    this.lastMode = new Map(); // matchId -> mode
  }

  // Auto-pick mode based on match context
  pickMode(context) {
    if (!context) return 'expert';
    const { scoreDiff, minute, isTopMatch, isRelegation, isDerby } = context;
    // Serious: knockout, relegation, derby, late game close score
    if (isRelegation || isDerby || (minute > 80 && Math.abs(scoreDiff || 0) <= 1)) return 'serious';
    // Troll: big scoreline diff, early blowout
    if (Math.abs(scoreDiff || 0) >= 3 || (minute < 30 && Math.abs(scoreDiff || 0) >= 2)) return 'troll';
    // Expert: default for top matches, balanced games
    return 'expert';
  }

  // Generate oracle quote for Thẻ Tiên Tri
  oracleQuote(hp, dp, ap, factors, matchContext) {
    const mode = this.pickMode(matchContext);
    const winner = hp > ap ? 'home' : ap > hp ? 'away' : 'draw';
    const margin = Math.abs(hp - ap);
    const homeName = matchContext?.homeName || 'Chủ nhà';
    const awayName = matchContext?.awayName || 'Khách';
    const templates = [];

    if (mode === 'troll') {
      if (winner === 'draw') {
        templates.push(
          `Ngựa thấy trận này mùi hòa khá nồng 🐴`,
          `Hai đội cứ "giao lưu" thôi, bàn thắng là thứ xa xỉ 🐴`,
          `Trận này Ngựa đặt cược... vào giấc ngủ trưa 😴🐴`,
        );
      } else if (margin > 25) {
        const strong = winner === 'home' ? homeName : awayName;
        const weak = winner === 'home' ? awayName : homeName;
        templates.push(
          `${weak} nghe tên mạnh, nhưng số liệu không bênh nổi 🐴`,
          `${strong} chỉ cần ra sân là đã thắng rồi... trên giấy 🐴`,
          `Ngựa nói thẳng: ${weak} hôm nay khó lắm 🐴`,
        );
      } else {
        const fav = winner === 'home' ? homeName : awayName;
        templates.push(
          `${fav} có phong độ ngon, nhưng bóng đá mà... ai biết được 🐴`,
          `Ngựa nghiêng về ${fav}, nhưng đừng tin Ngựa 100% nhé 🐴`,
          `Data nói ${fav} sáng cửa, nhưng sân cỏ không đọc data 🐴`,
        );
      }
    } else if (mode === 'serious') {
      if (winner === 'draw') {
        templates.push(
          `Trận đấu cân bằng, cả hai đều không muốn thua. Tỉ lệ hòa rất cao.`,
          `Đây là cuộc chiến thể lực và tinh thần. Rất khó phân định thắng thua.`,
        );
      } else {
        const fav = winner === 'home' ? homeName : awayName;
        const other = winner === 'home' ? awayName : homeName;
        templates.push(
          `${fav} nhỉnh hơn, nhưng ${other} sẽ không dễ buông. Trận đấu quyết định.`,
          `Dữ liệu cho thấy ${fav} có lợi thế, nhưng áp lực trận đấu có thể thay đổi tất cả.`,
          `Trận này không có chỗ cho sai lầm. ${fav} cần tận dụng mọi cơ hội.`,
        );
      }
    } else { // expert
      // Build insight from factors
      const formFactor = factors.find(f => f.includes('Phong độ') || f.includes('thắng') || f.includes('trận gần'));
      const h2hFactor = factors.find(f => f.includes('Đối đầu') || f.includes('đối đầu'));
      const playerFactor = factors.find(f => f.includes('phong độ cao') || f.includes('⭐'));

      if (formFactor && h2hFactor) {
        const fav = winner === 'home' ? homeName : awayName;
        templates.push(
          `Ngựa phân tích: ${fav} vừa có phong độ tốt, vừa có lịch sử đối đầu thuận lợi. Cửa sáng! 🐴`,
        );
      }
      if (playerFactor) {
        templates.push(
          `Cầu thủ ngôi sao đang trong phong độ cao — yếu tố có thể quyết định trận đấu. 🐴`,
        );
      }
      if (winner === 'home') {
        templates.push(
          `${homeName} mạnh sân nhà, dữ liệu ủng hộ. Nhưng đừng quên bóng đá luôn có bất ngờ. 🐴`,
          `Phân tích cho thấy ${homeName} có lợi thế rõ ràng hôm nay. 🐴`,
        );
      } else if (winner === 'away') {
        templates.push(
          `${awayName} dù đá sân khách nhưng phong độ vượt trội. Cửa khách đáng chú ý. 🐴`,
          `Ngựa thấy ${awayName} có đủ vũ khí để giành 3 điểm trên sân khách. 🐴`,
        );
      } else {
        templates.push(
          `Trận đấu cân bằng tuyệt đối. Ngựa thiên về hòa, nhưng sẵn sàng bất ngờ. 🐴`,
        );
      }
    }

    return this._pick(templates);
  }

  // Wrap commentary text with personality
  voiceWrap(text, type, matchContext) {
    const mode = this.pickMode(matchContext);
    // Only add personality to insight/narrative types, not raw event reports
    if (type === 'goal' || type === 'red_card' || type === 'card' || type === 'substitution') return text;

    if (type === 'insight' && mode === 'troll') {
      const trollSuffixes = [
        ' Ngựa nói rồi đấy! 🐴',
        ' Đúng như Ngựa dự đoán! 🐴',
        ' Bóng đá mà, đừng ngạc nhiên 🐴',
      ];
      return text + this._pick(trollSuffixes);
    }
    if (type === 'narrative' && mode === 'serious') {
      return text.replace('📝', '📝🐴');
    }
    return text;
  }

  // Commentary for turning points
  turningPointComment(matchId, team, beforePct, afterPct, trigger) {
    const shift = Math.round(afterPct - beforePct);
    const direction = shift > 0 ? 'tăng' : 'giảm';
    const templates = [
      `⚡ BƯỚC NGOẶT! Xác suất ${team} thắng ${direction} từ ${Math.round(beforePct)}% lên ${Math.round(afterPct)}%!`,
      `🔄 Thế trận đảo chiều! ${team} từ ${Math.round(beforePct)}% → ${Math.round(afterPct)}%. Ngựa đang cập nhật dự đoán! 🐴`,
      `📊 Biến động lớn: ${team} ${direction} ${Math.abs(shift)}% sau sự kiện vừa rồi!`,
    ];
    return this._pick(templates);
  }

  // Chat engagement prompts
  engagementPrompt(type, context) {
    const { home, away, score, minute } = context || {};
    const prompts = {
      goal: [
        `Bàn thắng vừa rồi có hợp lý không? 🔥 nếu đồng ý!`,
        `Ai ghi bàn tiếp theo? ⚽ = ${home || 'Chủ'}, 🔥 = ${away || 'Khách'}`,
        `Bàn đẹp hay bàn may? 👏 = Xứng đáng, 🍀 = May mắn`,
      ],
      red_card: [
        `Thẻ đỏ vừa rồi đúng hay oan? 😱 = Đáng, 🤡 = Oan`,
        `Đáng nhận thẻ đỏ không? 👏 = Đúng luật, 😭 = Quá nặng`,
      ],
      quiet: [
        `Trận đấu đang im ắng quá... Ai đoán bàn tiếp theo? 🤔`,
        `${minute || 0} phút rồi mà chưa có gì nổi bật. Ngựa đang buồn ngủ 😴🐴`,
        `Nhận định nhanh: trận này có thêm bàn không? 🔥 = Có, 😴 = Không`,
      ],
      var: [
        `VAR vừa can thiệp! Quyết định đúng không? 👏 = Đúng, 🤡 = Sai`,
      ],
      halftime: [
        `Nửa trận đã qua. Hiệp 2 sẽ thế nào? Dự đoán nào! 🐴`,
      ],
    };
    const arr = prompts[type] || prompts.quiet;
    return `🐴 ${this._pick(arr)}`;
  }

  // Signature
  signature() {
    return '🐴 Ngựa đã nói — BongDa365';
  }

  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
}

module.exports = new MascotVoice();
