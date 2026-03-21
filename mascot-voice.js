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
  engagementPrompt(type, context, style) {
    // If BLV style, use BLV engagement templates
    if (style && this.isBLVStyle(style)) {
      const templates = MascotVoice.BLV_TEMPLATES[style];
      if (templates && templates.engagement) {
        return this._pick(templates.engagement);
      }
    }

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

  // ═══════════════════════════════════════
  // BLV (Bình Luận Viên) Commentary Styles
  // ═══════════════════════════════════════

  static BLV_TEMPLATES = {
    // ── Tạ Biên Cương: Emotional, dramatic, iconic ──
    blv_bien_cuong: {
      goal: [
        `⚽ BÀN THẮNG! BÀN THẮNG! BÀN THẮNG! {teamName} ghi bàn ở phút {minute}! {home} {scoreHome}-{scoreAway} {away}! KHÔNG THỂ TIN ĐƯỢC!!!`,
        `⚽ VÀOOOOO! TUYỆT VỜI! {teamName} xé toạc lưới đối phương! Phút {minute}! ĐẲNG CẤP!!!`,
        `⚽ QUÁ TUYỆT VỜI! BÀN THẮNG ĐẲNG CẤP CỦA {teamName}! Phút {minute}! Khán giả ơi, các bạn thấy chưa!!!`,
        `⚽ BÀN THẮNG! BÀN THẮNG TUYỆT ĐẸP! {teamName} nâng tỉ số lên {scoreHome}-{scoreAway}! TUYỆT VỜI! TUYỆT VỜI!!!`,
        `⚽ VÀO RỒI! VÀO RỒI! {teamName} phút {minute}! Pha dứt điểm không thể cản phá! QUÁ ĐẸP!!!`,
        `⚽ TRỜI ƠI! BÀN THẮNG! {teamName} ghi bàn phút {minute}! Cả sân vận động như muốn nổ tung!!!`,
        `⚽ SIÊU PHẨM! SIÊU PHẨM CỦA {teamName}! Phút {minute}! Đây là bàn thắng sẽ được nhớ mãi!!!`,
        `⚽ BÀN THẮNG QUYẾT ĐỊNH! {teamName} phút {minute}! {home} {scoreHome}-{scoreAway} {away}! KHÔNG AI CẢN NỔI!!!`,
      ],
      card: [
        `🟨 Thẻ vàng! Trọng tài rút thẻ cho {player} ({team}) phút {minute}! Pha vào bóng quá quyết liệt!`,
        `🟨 THẺ VÀNG! {player} ({team}) bị cảnh cáo ở phút {minute}! Cẩn thận! Cẩn thận!`,
        `🟨 Trọng tài không tha! Thẻ vàng cho {player} ({team}) phút {minute}!`,
        `🟨 {player} nhận thẻ vàng! Phút {minute}! Trận đấu đang nóng lên từng phút!`,
      ],
      red_card: [
        `🟥 THẺ ĐỎ! THẺ ĐỎ! {player} ({team}) bị đuổi khỏi sân phút {minute}! KHÔNG THỂ TIN ĐƯỢC! Trận đấu thay đổi hoàn toàn!!!`,
        `🟥 TRỜI ƠI! THẺ ĐỎ! {player} ({team}) phải rời sân! Phút {minute}! {team} chơi thiếu người! DRAMA!!!`,
        `🟥 THẺ ĐỎ TRỰC TIẾP! {player} ({team}) phút {minute}! Quyết định nghiêm khắc của trọng tài! THAY ĐỔI CỤC DIỆN!!!`,
        `🟥 ĐỎ! TRỌNG TÀI RÚT THẺ ĐỎ! {player} ({team}) phút {minute}! Cầu thủ rời sân trong tức giận!!!`,
      ],
      halftime: [
        `⏸️ HẾT HIỆP 1! {home} {scoreHome}-{scoreAway} {away}! Một hiệp đấu đầy cảm xúc! Khán giả ơi, hãy chờ hiệp 2!`,
        `⏸️ NGHỈ GIỮA HIỆP! {home} {scoreHome}-{scoreAway} {away}! Tôi tin hiệp 2 sẽ còn KỊCH TÍNH hơn nữa!!!`,
        `⏸️ KẾT THÚC HIỆP 1! Tỉ số {scoreHome}-{scoreAway}! Trận đấu đang RẤT hay! Đừng đi đâu nhé!!!`,
        `⏸️ HẾT HIỆP 1! {home} {scoreHome}-{scoreAway} {away}! Cả hai đội đã mang đến một hiệp đấu TUYỆT VỜI!`,
      ],
      fulltime: [
        `🏁 HẾT GIỜ! HẾT GIỜ! {home} {scoreHome}-{scoreAway} {away}! Trận đấu KẾT THÚC! Một trận cầu ĐÁNG NHỚ!!!`,
        `🏁 TIẾNG CÒI KẾT THÚC! {home} {scoreHome}-{scoreAway} {away}! CẢM ƠN CÁC CẦU THỦ! CẢM ƠN BÓNG ĐÁ!!!`,
        `🏁 KẾT THÚC! KẾT THÚC TRẬN ĐẤU! {home} {scoreHome}-{scoreAway} {away}! Một trận cầu KHÔNG THỂ QUÊN!!!`,
        `🏁 HẾT! {home} {scoreHome}-{scoreAway} {away}! Trận đấu khép lại! TUYỆT VỜI! Xin chào và hẹn gặp lại!!!`,
      ],
      insight: [
        `📊 Các bạn thấy không! {stat}! Trận đấu đang TUYỆT VỜI!`,
        `📊 CON SỐ BIẾT NÓI! {stat}! KHÔNG THỂ TIN NỔI!`,
        `📊 CHÚ Ý! {stat}! Thế trận đang thay đổi!`,
        `📊 ĐÁNG CHÚ Ý! {stat}! Đây là điều khiến trận đấu thêm kịch tính!`,
      ],
      engagement: [
        `🔥 Khán giả ơi! Trận đấu đang QUÁ HAY! Các bạn nghĩ sao? Bình luận ngay!!!`,
        `🔥 KHÔNG THỂ RỜI MẮT! Ai sẽ ghi bàn tiếp theo? Dự đoán đi!!!`,
        `🔥 Các bạn có đang xem không? Trận cầu ĐỈNH CAO! Chia sẻ cảm xúc nào!!!`,
      ],
    },

    // ── Anh Quân: Analytical, calm, tactical ──
    blv_anh_quan: {
      goal: [
        `⚽ Bàn thắng cho {teamName} ở phút {minute}. Pha xử lý kỹ thuật rất tinh tế trước khi dứt điểm. {home} {scoreHome}-{scoreAway} {away}.`,
        `⚽ {teamName} ghi bàn phút {minute}. Đường chuyền xuyên tuyến phá vỡ hàng phòng ngự, cầu thủ dứt điểm chính xác. {scoreHome}-{scoreAway}.`,
        `⚽ Bàn thắng đến từ chiến thuật pressing cao của {teamName}. Phút {minute}, tỉ số {scoreHome}-{scoreAway}. Đội phòng ngự đã để lộ khoảng trống giữa hai trung vệ.`,
        `⚽ {teamName} mở tỉ số phút {minute}. Pha phối hợp tam giác bên cánh trái tạo ra khoảng trống, và cú sút đã đi vào góc xa.`,
        `⚽ Phút {minute}, {teamName} nâng tỉ số lên {scoreHome}-{scoreAway}. Chiến thuật phản công nhanh đã phát huy hiệu quả ở tình huống này.`,
        `⚽ Bàn thắng hợp lý cho {teamName} ở phút {minute}. Họ đã kiểm soát nhịp trận đấu và tạo ra cơ hội một cách bài bản.`,
        `⚽ {teamName} ghi bàn phút {minute}. Đường chuyền dài chuyển hướng tấn công rất thông minh, bắt đối thủ lệch đội hình.`,
        `⚽ Bàn thắng từ tình huống cố định. {teamName} phút {minute}. Chiến thuật set-piece được chuẩn bị kỹ lưỡng. {scoreHome}-{scoreAway}.`,
      ],
      card: [
        `🟨 Thẻ vàng cho {player} ({team}) phút {minute}. Pha vào bóng chậm nhịp, không tính được timing của đối thủ.`,
        `🟨 {player} ({team}) nhận thẻ vàng phút {minute}. Lỗi chiến thuật để ngăn pha phản công nguy hiểm.`,
        `🟨 Phạm lỗi chiến thuật, thẻ vàng cho {player} ({team}) phút {minute}. Lựa chọn phạm lỗi ở vị trí ít nguy hiểm hơn.`,
        `🟨 Thẻ vàng {player} ({team}) phút {minute}. Pha tranh chấp tay đôi quá mạnh, trọng tài đúng khi rút thẻ.`,
      ],
      red_card: [
        `🟥 Thẻ đỏ cho {player} ({team}) phút {minute}. Quyết định này thay đổi hoàn toàn cục diện chiến thuật. {team} buộc phải chuyển sang sơ đồ phòng ngự.`,
        `🟥 {player} ({team}) nhận thẻ đỏ phút {minute}. Chơi thiếu người, HLV sẽ phải điều chỉnh đội hình và chiến thuật ngay lập tức.`,
        `🟥 Thẻ đỏ trực tiếp cho {player} ({team}) ở phút {minute}. Pha vào bóng nguy hiểm, hai chân rời mặt sân. Quyết định hợp lý từ trọng tài.`,
        `🟥 {player} ({team}) bị truất quyền thi đấu phút {minute}. Đội bóng mất một mắt xích quan trọng trong hệ thống pressing.`,
      ],
      halftime: [
        `⏸️ Hết hiệp 1: {home} {scoreHome}-{scoreAway} {away}. Nhìn vào số liệu kiểm soát bóng và số pha dứt điểm, ta thấy rõ đội nào đang kiểm soát nhịp trận đấu.`,
        `⏸️ Nghỉ giữa hiệp. {home} {scoreHome}-{scoreAway} {away}. Chiến thuật pressing cao đang tạo ra khác biệt. HLV cần điều chỉnh ở hiệp 2.`,
        `⏸️ Kết thúc hiệp 1 với tỉ số {scoreHome}-{scoreAway}. Cả hai đội đều có những phương án tấn công rõ ràng, nhưng khâu hoàn thiện cần cải thiện.`,
        `⏸️ Hiệp 1 khép lại: {home} {scoreHome}-{scoreAway} {away}. Hệ thống phòng ngự zonal marking đang hoạt động hiệu quả. Hiệp 2 sẽ là bài toán chiến thuật.`,
      ],
      fulltime: [
        `🏁 Kết thúc trận đấu: {home} {scoreHome}-{scoreAway} {away}. Chiến thuật đã quyết định kết quả hôm nay. Đội thắng xứng đáng với cách chơi bài bản.`,
        `🏁 Hết giờ. {home} {scoreHome}-{scoreAway} {away}. Nhìn tổng thể, đội kiểm soát bóng tốt hơn và tạo ra nhiều cơ hội nguy hiểm hơn đã giành chiến thắng.`,
        `🏁 Trận đấu kết thúc: {home} {scoreHome}-{scoreAway} {away}. Sự điều chỉnh chiến thuật ở hiệp 2 đã tạo ra bước ngoặt quyết định.`,
        `🏁 Fulltime: {home} {scoreHome}-{scoreAway} {away}. Một trận đấu hay về mặt chiến thuật. Cả hai HLV đều có những phương án đáng chú ý.`,
      ],
      insight: [
        `📊 Phân tích: {stat}. Điều này cho thấy rõ xu hướng chiến thuật của trận đấu.`,
        `📊 Số liệu đáng chú ý: {stat}. Hệ thống pressing đang tạo ra hiệu quả rõ rệt.`,
        `📊 Chiến thuật nói qua số liệu: {stat}. Đội kiểm soát nhịp trận đang có lợi thế.`,
        `📊 Dữ liệu trận đấu: {stat}. Điều này phản ánh chính xác những gì chúng ta thấy trên sân.`,
      ],
      engagement: [
        `🤔 Theo các bạn, đội nào đang có phương án chiến thuật tốt hơn? Hãy phân tích cùng tôi.`,
        `🤔 Nếu bạn là HLV, bạn sẽ thay đổi gì ở hiệp 2? Chia sẻ quan điểm chiến thuật nhé.`,
        `🤔 Sơ đồ chiến thuật nào sẽ phù hợp hơn cho tình huống này? Bình luận bên dưới.`,
      ],
    },

    // ── Quang Huy: Balanced, modern terms, friendly ──
    blv_quang_huy: {
      goal: [
        `⚽ Bàn thắng! {teamName} ghi bàn ở phút {minute}! Tỉ số {scoreHome}-{scoreAway}! Trận đấu hấp dẫn quá các bạn ơi!`,
        `⚽ {teamName} phá vỡ bế tắc ở phút {minute}! {home} {scoreHome}-{scoreAway} {away}! Pha lập công đúng lúc cần thiết!`,
        `⚽ VÀO! {teamName} ghi bàn phút {minute}! Cú false nine điển hình, kéo trung vệ ra rồi tạo khoảng trống cho đồng đội!`,
        `⚽ Bàn thắng đẹp cho {teamName}! Phút {minute}! Kiểu như Messi hay làm ấy các bạn! {scoreHome}-{scoreAway}!`,
        `⚽ {teamName} nâng tỉ số! Phút {minute}! Pha transition tấn công rất nhanh, đối thủ chưa kịp về đội hình!`,
        `⚽ Bàn thắng cho {teamName} ở phút {minute}! Pha overlap cánh phải tạo ra cơ hội và cú dứt điểm chính xác!`,
        `⚽ {teamName} ghi bàn! Phút {minute}! Tỉ số {scoreHome}-{scoreAway}! Trận cầu này đang cho thấy đẳng cấp của cả hai đội!`,
        `⚽ Phút {minute}, {teamName} có bàn thắng! {home} {scoreHome}-{scoreAway} {away}! Đúng kiểu counter-pressing mà Klopp hay áp dụng!`,
      ],
      card: [
        `🟨 Thẻ vàng cho {player} ({team}) phút {minute}. Pha tactical foul kinh điển, chấp nhận phạm lỗi để cắt đường phản công.`,
        `🟨 {player} ({team}) nhận thẻ vàng phút {minute}. Trận đấu bắt đầu nóng lên rồi các bạn ơi!`,
        `🟨 Thẻ vàng! {player} ({team}) phút {minute}. Kiểu Casemiro ngày xưa ấy, phạm lỗi đúng thời điểm!`,
        `🟨 {player} ({team}) bị cảnh cáo phút {minute}. Pha vào bóng hơi muộn, trọng tài rút thẻ hợp lý.`,
      ],
      red_card: [
        `🟥 Thẻ đỏ! {player} ({team}) bị đuổi phút {minute}! Giống như trận chung kết Champions League năm nào, một thẻ đỏ thay đổi tất cả!`,
        `🟥 {player} ({team}) nhận thẻ đỏ phút {minute}! Trận đấu xoay chuyển hoàn toàn! Chơi 10 người rất khó các bạn ơi!`,
        `🟥 Ôi! Thẻ đỏ cho {player} ({team}) phút {minute}! Đội bóng phải chơi thiếu người, cần điều chỉnh ngay như kiểu Simeone hay làm!`,
        `🟥 Thẻ đỏ trực tiếp! {player} ({team}) phút {minute}! Pha vào bóng rất nguy hiểm. VAR cũng sẽ đồng ý với quyết định này!`,
      ],
      halftime: [
        `⏸️ Hết hiệp 1! {home} {scoreHome}-{scoreAway} {away}! Trận đấu hấp dẫn! Giống như những trận derby lớn ở châu Âu vậy!`,
        `⏸️ Nghỉ giữa hiệp! {home} {scoreHome}-{scoreAway} {away}! Cả hai đội đều chơi high tempo, rất thú vị cho người xem!`,
        `⏸️ Kết thúc 45 phút đầu! {scoreHome}-{scoreAway}! Các HLV sẽ có 15 phút để điều chỉnh. Hiệp 2 hứa hẹn sẽ hay hơn!`,
        `⏸️ Hết hiệp 1! {home} {scoreHome}-{scoreAway} {away}! Half-time analysis cho thấy trận đấu rất cân bằng. Các bạn đừng đi đâu nhé!`,
      ],
      fulltime: [
        `🏁 Kết thúc! {home} {scoreHome}-{scoreAway} {away}! Một trận cầu đáng xem! Cảm ơn các bạn đã theo dõi!`,
        `🏁 Full-time! {home} {scoreHome}-{scoreAway} {away}! Trận đấu hay như những trận ở Premier League vậy! Hẹn gặp lại!`,
        `🏁 Hết giờ! {home} {scoreHome}-{scoreAway} {away}! Một kết quả xứng đáng. Bóng đá luôn tuyệt vời khi được chơi đẹp!`,
        `🏁 Trận đấu kết thúc! {home} {scoreHome}-{scoreAway} {away}! World-class match! Cảm ơn cả hai đội đã mang đến 90 phút tuyệt vời!`,
      ],
      insight: [
        `📊 Trận đấu hấp dẫn: {stat}. Giống như những trận cầu ở top 5 châu Âu!`,
        `📊 Số liệu cho thấy: {stat}. Xu hướng tiki-taka đang rõ ràng trong cách chơi.`,
        `📊 Đáng chú ý: {stat}. Kiểu pressing gegenpressing đang tạo hiệu quả rõ rệt.`,
        `📊 Cập nhật: {stat}. Trận đấu đang diễn biến rất thú vị cho người xem trung lập!`,
      ],
      engagement: [
        `💬 Trận này các bạn thấy sao? Giống giải nào ở châu Âu nhất? Bình luận nhé!`,
        `💬 Ai đang chơi hay nhất trận? Man of the match theo các bạn là ai? Chia sẻ nào!`,
        `💬 Dự đoán tỉ số cuối cùng nào các bạn! Comment bên dưới, trận này khó đoán lắm!`,
      ],
    },
  };

  // Get BLV template for a specific style and event type
  getBLVTemplate(style, type, data) {
    const templates = MascotVoice.BLV_TEMPLATES[style];
    if (!templates || !templates[type]) return null;
    const template = this._pick(templates[type]);
    // Replace placeholders
    return template
      .replace(/\{teamName\}/g, data.teamName || '')
      .replace(/\{minute\}/g, data.minute || '')
      .replace(/\{home\}/g, data.home || '')
      .replace(/\{away\}/g, data.away || '')
      .replace(/\{scoreHome\}/g, data.scoreHome ?? '')
      .replace(/\{scoreAway\}/g, data.scoreAway ?? '')
      .replace(/\{player\}/g, data.player || '')
      .replace(/\{team\}/g, data.team || '')
      .replace(/\{stat\}/g, data.stat || '');
  }

  // Check if a style is a BLV style
  isBLVStyle(style) {
    return style in (MascotVoice.BLV_TEMPLATES || {});
  }

  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
}

module.exports = new MascotVoice();
