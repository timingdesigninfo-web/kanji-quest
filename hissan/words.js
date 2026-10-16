/* ひっさんクエスト：文章題の型（テンプレート）
 *
 * 1つの型 ＝ 1つの場面。数字・名前は 出すたびに自動で変わる（同じ問題は ほぼ出ない）。
 * 毎日10問のうち、後半に 学年ごとの数（WORDS_PER_DAY）だけ 文章題を出す。
 *
 * ■ 問題のリニューアルのルール（アップデートのたびに必ず守る）
 *   1. 文章題を変えるアップデートでは BANK_VER を 1つ上げる。
 *   2. そのとき、学年ごとに 型の2割以上を 新しくする（新しい型には add: BANK_VER をつける）。
 *      古い型は 消すか、場面を言いかえて 新しい id にする（add も新しくする）。
 *   3. 単元ごとに 型は3つ以上。言葉から計算を選ぶ型（たし算の単元に ひき算の文 など）を 1つ以上まぜる。
 *   4. 漢字は その学年までに習うものだけ。1年は ひらがな・カタカナだけ。
 *   5. 文は自作（教科書・ドリルの転載はしない）。
 *   → node tools/check-words.js で 1〜3 と、数字・答えのおかしな型がないかを確かめる。
 *
 * 型の書き方：
 *   {id, u:単元id, add:追加した版, make(r){ ... return {text, op, a, b, ans, rem?, final?, unit} }}
 *   正しい式は a op b（a・b は数、分数は "3/4"）。ans・rem はその式の答え。
 *   final があるときは、こたえは final（例：あまりを考えて 長いすは 8きゃく）。
 *   unit は こたえのわくの右に出す単位（なければ ''）。
 *   r: R(a,b) 乱数／pick(配列)／name() 名前（1問の中で重ならない）／gen(単元id) その単元の計算の数字
 *      add(la,lb) sub(la,lb) mul(la,lb) div(la,lb) frac(op) 計算の数字
 */
(function (root) {
  const BANK_VER = 1;
  const WORDS_PER_DAY = [0, 1, 2, 3, 3, 4, 4]; // 学年ごと（10問中）

  const NAMES = ['ひろと', 'ゆい', 'そうた', 'めい', 'りく', 'さくら', 'はると', 'あおい', 'ゆうま', 'こはる', 'れん', 'みお', 'たいが', 'ひなた'];
  // 1つの問題の数字・答えをまとめる
  const W = (p, text, unit, extra) => ({ op: p.op, a: p.a, b: p.b, ans: p.ans, rem: p.rem, ...extra, text, unit });
  const q1 = p => (p.rem ? p.ans + 1 : p.ans); // あまりが出たら もう1つ いる

  const T = [
    /* ===== 1年 ===== */
    { id: 'g1add-ame', u: 'g1add', add: 1, make(r) { const p = r.gen('g1add'), n = r.name();
      return W(p, `${n}さんは あめを ${p.a}こ、おねえさんは ${p.b}こ もって います。あわせて なんこ ですか。`, 'こ') } },
    { id: 'g1add-hato', u: 'g1add', add: 1, make(r) { const p = r.gen('g1add');
      return W(p, `こうえんに はとが ${p.a}わ います。そこへ ${p.b}わ とんで きました。はとは ぜんぶで なんわに なりましたか。`, 'わ') } },
    { id: 'g1add-retsu', u: 'g1add', add: 1, make(r) { const p = r.gen('g1add'), n = r.name();
      return W(p, `${n}さんは まえから ${p.a}ばんめに ならんで います。${n}さんの うしろには ${p.b}にん います。みんなで なんにん ですか。`, 'にん') } },
    { id: 'g1add-hana-chigai', u: 'g1add', add: 1, make(r) { const p = r.gen('g1sub');
      return W(p, `あかい はなが ${p.a}ほん、しろい はなが ${p.b}ほん さいて います。あかい はなは しろい はなより なんぼん おおいですか。`, 'ほん') } },

    { id: 'g1sub-mikan', u: 'g1sub', add: 1, make(r) { const p = r.gen('g1sub');
      return W(p, `みかんが ${p.a}こ あります。${p.b}こ たべました。のこりは なんこ ですか。`, 'こ') } },
    { id: 'g1sub-isu', u: 'g1sub', add: 1, make(r) { const p = r.gen('g1sub');
      return W(p, `こどもが ${p.a}にん、いすが ${p.b}こ あります。ひとり 1こずつ すわると、すわれない こどもは なんにん ですか。`, 'にん') } },
    { id: 'g1sub-shiiru', u: 'g1sub', add: 1, make(r) { const p = r.gen('g1sub'), n = r.name();
      return W(p, `${n}さんは シールを ${p.a}まい もって います。ともだちに ${p.b}まい あげると、なんまいに なりますか。`, 'まい') } },
    { id: 'g1sub-basu-fueru', u: 'g1sub', add: 1, make(r) { const p = r.gen('g1add');
      return W(p, `バスに ${p.a}にん のって います。つぎの ていりゅうじょで ${p.b}にん のって きました。みんなで なんにんに なりましたか。`, 'にん') } },

    /* ===== 2年 ===== */
    { id: 'g2add-kaimono', u: 'g2add', add: 1, make(r) { const p = r.add(2, 2), n = r.name();
      return W(p, `${n}さんは ${p.a}円の ノートと ${p.b}円の けしゴムを 買います。あわせて 何円 ですか。`, '円') } },
    { id: 'g2add-page', u: 'g2add', add: 1, make(r) { const p = r.add(2, 2);
      return W(p, `ずかんを きのうまでに ${p.a}ページ 読みました。きょうは ${p.b}ページ 読みました。ぜんぶで 何ページ 読みましたか。`, 'ページ') } },
    { id: 'g2add-narabu', u: 'g2add', add: 1, make(r) { const p = r.add(2, 2);
      return W(p, `ゆうえんちの のりものに 大人が ${p.a}人、子どもが ${p.b}人 ならんで います。みんなで 何人 ですか。`, '人') } },
    { id: 'g2add-irogami-nokori', u: 'g2add', add: 1, make(r) { const p = r.sub(2, 2);
      return W(p, `色紙が ${p.a}まい あります。工作で ${p.b}まい つかいました。のこりは 何まい ですか。`, 'まい') } },

    { id: 'g2sub-okashi', u: 'g2sub', add: 1, make(r) { const p = r.sub(2, 2), n = r.name();
      return W(p, `${n}さんは ${p.a}円 もって います。${p.b}円の おかしを 買うと、のこりは 何円 ですか。`, '円') } },
    { id: 'g2sub-donguri', u: 'g2sub', add: 1, make(r) { const p = r.sub(2, 2), n = r.name(), m = r.name();
      return W(p, `どんぐりを ${n}さんは ${p.a}こ、${m}さんは ${p.b}こ ひろいました。ちがいは 何こ ですか。`, 'こ') } },
    { id: 'g2sub-ato', u: 'g2sub', add: 1, make(r) { const p = r.sub(2, 2);
      return W(p, `${p.a}ページの 本を 読んで います。いま ${p.b}ページまで 読みました。あと 何ページ ですか。`, 'ページ') } },
    { id: 'g2sub-hajime', u: 'g2sub', add: 1, make(r) { const p = r.add(2, 2);
      return W(p, `みかんを ${p.b}こ 食べたら、のこりが ${p.a}こに なりました。はじめに 何こ ありましたか。`, 'こ') } },

    { id: 'g2kuku-keeki', u: 'g2kuku', add: 1, make(r) { const p = r.gen('g2kuku');
      return W(p, `1はこに ケーキが ${p.a}こずつ 入って います。${p.b}はこでは 何こ ですか。`, 'こ') } },
    { id: 'g2kuku-page', u: 'g2kuku', add: 1, make(r) { const p = r.gen('g2kuku'), n = r.name();
      return W(p, `${n}さんは 1日に ${p.a}ページずつ 本を 読みます。${p.b}日では 何ページ 読めますか。`, 'ページ') } },
    { id: 'g2kuku-nagaisu', u: 'g2kuku', add: 1, make(r) { const p = r.gen('g2kuku');
      return W(p, `長いすが ${p.b}きゃく あります。1きゃくに ${p.a}人ずつ すわると、みんなで 何人 すわれますか。`, '人') } },
    { id: 'g2kuku-tape', u: 'g2kuku', add: 1, make(r) { const p = r.gen('g2kuku');
      return W(p, `${p.a}cmの テープを ${p.b}本 まっすぐ ならべます。はしから はしまで 何cm ですか。`, 'cm') } },
    { id: 'g2kuku-irogami-awase', u: 'g2kuku', add: 1, make(r) { const p = r.add(2, 2);
      return W(p, `赤い 色紙が ${p.a}まい、青い 色紙が ${p.b}まい あります。あわせて 何まい ですか。`, 'まい') } },

    { id: 'g2add3-hon', u: 'g2add3', add: 1, make(r) { const p = r.add(3, 2);
      return W(p, `図書室に 本が ${p.a}さつ あります。新しく ${p.b}さつ 入りました。ぜんぶで 何さつ ですか。`, 'さつ') } },
    { id: 'g2add3-kaimono', u: 'g2add3', add: 1, make(r) { const p = r.sub(3, 2);
      return W(p, `${p.a}円 もって 買いものに 行きました。${p.b}円 つかいました。のこりは 何円 ですか。`, '円') } },
    { id: 'g2add3-michi', u: 'g2add3', add: 1, make(r) { const p = r.add(3, 2);
      return W(p, `家から ゆうびんきょくまで ${p.a}m、ゆうびんきょくから 学校まで ${p.b}m あります。家から ゆうびんきょくを 通って 学校まで 何m ですか。`, 'm') } },
    { id: 'g2add3-onnanoko', u: 'g2add3', add: 1, make(r) { const p = r.sub(3, 2);
      return W(p, `ある 学校の 子どもは ${p.a}人です。そのうち 男の子は ${p.b}人です。女の子は 何人 ですか。`, '人') } },

    /* ===== 3年 ===== */
    { id: 'g3add-toshokan', u: 'g3add', add: 1, make(r) { const p = r.gen('g3add');
      return W(p, `町の 図書館には、絵本が ${p.a}さつ、図かんが ${p.b}さつ あります。あわせて 何さつ ですか。`, 'さつ') } },
    { id: 'g3add-yuuenchi', u: 'g3add', add: 1, make(r) { const p = r.gen('g3add');
      return W(p, `ある日の 遊園地に 来た 人は、午前が ${p.a}人、午後が ${p.b}人 でした。この日は 全部で 何人 来ましたか。`, '人') } },
    { id: 'g3add-jitensha', u: 'g3add', add: 1, make(r) { const p = r.gen('g3add');
      return W(p, `${p.a}円の 自転車の ライトと、${p.b}円の かぎを 買います。代金は 何円 ですか。`, '円') } },
    { id: 'g3add-mokuhyou', u: 'g3add', add: 1, make(r) { const p = r.gen('g3sub');
      return W(p, `牛にゅうパックを ${p.a}こ 集める 目ひょうです。いま ${p.b}こ 集まりました。あと 何こ 集めれば よいですか。`, 'こ') } },

    { id: 'g3sub-hon', u: 'g3sub', add: 1, make(r) { const p = r.gen('g3sub'), n = r.name();
      return W(p, `${n}さんは ${p.a}円 持って います。${p.b}円の 本を 買うと、のこりは 何円 ですか。`, '円') } },
    { id: 'g3sub-gakkou', u: 'g3sub', add: 1, make(r) { const p = r.gen('g3sub');
      return W(p, `東小学校の 子どもは ${p.a}人、西小学校の 子どもは ${p.b}人 です。どちらが 何人 多いか、ちがいを もとめましょう。`, '人') } },
    { id: 'g3sub-eki', u: 'g3sub', add: 1, make(r) { const p = r.gen('g3sub');
      return W(p, `家から 駅までは ${p.a}m あります。いま ${p.b}m 歩きました。駅まで あと 何m ですか。`, 'm') } },
    { id: 'g3sub-hajime', u: 'g3sub', add: 1, make(r) { const p = r.gen('g3add');
      return W(p, `シールを ${p.b}まい 使ったら、${p.a}まい のこりました。はじめに 何まい ありましたか。`, 'まい') } },

    { id: 'g3divr-nagaisu', u: 'g3divr', add: 1, make(r) { const p = r.gen('g3divr');
      return W(p, `${p.a}人が 長いすに ${p.b}人ずつ すわります。みんなが すわるには、長いすは 何きゃく いりますか。`, 'きゃく', { final: q1(p) }) } },
    { id: 'g3divr-ame', u: 'g3divr', add: 1, make(r) { const p = r.gen('g3divr');
      return W(p, `あめが ${p.a}こ あります。${p.b}人で 同じ数ずつ 分けると、1人 何こに なって、何こ あまりますか。`, 'こ') } },
    { id: 'g3divr-ribon', u: 'g3divr', add: 1, make(r) { const p = r.gen('g3divr');
      return W(p, `${p.a}cmの リボンを 切って、${p.b}cmの リボンを 作ります。${p.b}cmの リボンは 何本 できますか。`, '本', { final: p.ans }) } },
    { id: 'g3divr-shashin', u: 'g3divr', add: 1, make(r) { const p = r.gen('g3divr');
      return W(p, `${p.a}まいの 写真を、アルバムの 1ページに ${p.b}まいずつ はります。全部 はるには 何ページ いりますか。`, 'ページ', { final: q1(p) }) } },

    { id: 'g3mul1-pan', u: 'g3mul1', add: 1, make(r) { const p = r.gen('g3mul1');
      return W(p, `1こ ${p.a}円の パンを ${p.b}こ 買います。代金は 何円 ですか。`, '円') } },
    { id: 'g3mul1-irogami', u: 'g3mul1', add: 1, make(r) { const p = r.gen('g3mul1');
      return W(p, `1はこ ${p.a}まい入りの 色紙が ${p.b}はこ あります。色紙は 全部で 何まい ですか。`, 'まい') } },
    { id: 'g3mul1-hashiru', u: 'g3mul1', add: 1, make(r) { const p = r.gen('g3mul1'), n = r.name();
      return W(p, `${n}さんは 毎日 ${p.a}m 走ります。${p.b}日間では 何m 走りますか。`, 'm') } },
    { id: 'g3mul1-kome', u: 'g3mul1', add: 1, make(r) { const p = r.gen('g3mul1');
      return W(p, `1ふくろ ${p.a}gの 米が ${p.b}ふくろ あります。重さは 全部で 何g ですか。`, 'g') } },
    { id: 'g3mul1-gamu-wari', u: 'g3mul1', add: 1, make(r) { const p = r.gen('g3divr');
      return W(p, `${p.a}円 持って います。1こ ${p.b}円の ガムは 何こ 買えますか。`, 'こ', { final: p.ans }) } },

    { id: 'g3mul2-note', u: 'g3mul2', add: 1, make(r) { const a = r.R(12, 99), b = r.R(21, 38);
      return W({ op: '×', a, b, ans: a * b }, `1さつ ${a}円の ノートを、クラスの ${b}人に 1さつずつ 買います。代金は 全部で 何円 ですか。`, '円') } },
    { id: 'g3mul2-gayoushi', u: 'g3mul2', add: 1, make(r) { const p = r.gen('g3mul2');
      return W(p, `1たば ${p.a}まいの 画用紙が ${p.b}たば あります。画用紙は 全部で 何まい ですか。`, 'まい') } },
    { id: 'g3mul2-aruku', u: 'g3mul2', add: 1, make(r) { const p = r.gen('g3mul2');
      return W(p, `1分間に ${p.a}m 歩きます。同じ はやさで ${p.b}分間 歩くと、何m 進みますか。`, 'm') } },
    { id: 'g3mul2-tamago', u: 'g3mul2', add: 1, make(r) { const a = r.R(12, 30), b = r.R(12, 99);
      return W({ op: '×', a, b, ans: a * b }, `1パックに たまごが ${a}こ 入って います。${b}パックでは たまごは 何こ ですか。`, 'こ') } },
    { id: 'g3mul2-chokin-awase', u: 'g3mul2', add: 1, make(r) { const p = r.gen('g3add');
      return W(p, `ちょ金箱に ${p.a}円 入って います。きょう ${p.b}円 入れました。全部で 何円に なりましたか。`, '円') } },

    /* ===== 4年 ===== */
    { id: 'g4div1-card', u: 'g4div1', add: 1, make(r) { const p = r.gen('g4div1');
      return W(p, `${p.a}まいの カードを ${p.b}人で 同じ数ずつ 分けます。1人 何まいに なって、何まい あまりますか。`, 'まい') } },
    { id: 'g4div1-himo', u: 'g4div1', add: 1, make(r) { const p = r.gen('g4div1');
      return W(p, `${p.a}cmの ひもを ${p.b}cmずつ 切ります。${p.b}cmの ひもは 何本 できて、何cm あまりますか。`, '本') } },
    { id: 'g4div1-kago', u: 'g4div1', add: 1, make(r) { const p = r.gen('g4div1');
      return W(p, `ボールが ${p.a}こ あります。1つの かごに ${p.b}こずつ 入れます。全部 入れるには、かごは 何こ いりますか。`, 'こ', { final: q1(p) }) } },
    { id: 'g4div1-yomu', u: 'g4div1', add: 1, make(r) { const p = r.gen('g4div1');
      return W(p, `${p.a}ページの 本を、毎日 ${p.b}ページずつ 読みます。読み終わるのは 何日目 ですか。`, '日目', { final: q1(p) }) } },

    { id: 'g4div2-irogami', u: 'g4div2', add: 1, make(r) { const p = r.gen('g4div2');
      return W(p, `${p.a}まいの 色紙を ${p.b}人で 同じ数ずつ 分けます。1人 何まいに なって、何まい あまりますか。`, 'まい') } },
    { id: 'g4div2-enpitsu', u: 'g4div2', add: 1, make(r) { const p = r.gen('g4div2');
      return W(p, `${p.a}円で、1本 ${p.b}円の えん筆を 買えるだけ 買います。何本 買えて、何円 のこりますか。`, '本') } },
    { id: 'g4div2-basu', u: 'g4div2', add: 1, make(r) { const p = r.gen('g4div2');
      return W(p, `${p.a}人が、1台に ${p.b}人まで 乗れる バスに 乗ります。全員が 乗るには、バスは 何台 いりますか。`, '台', { final: q1(p) }) } },
    { id: 'g4div2-teepu', u: 'g4div2', add: 1, make(r) { const p = r.gen('g4div2');
      return W(p, `${p.a}cmの テープから、${p.b}cmの テープは 何本 とれますか。`, '本', { final: p.ans }) } },

    { id: 'g4mul32-keeki', u: 'g4mul32', add: 1, make(r) { const p = r.gen('g4mul32');
      return W(p, `1こ ${p.a}円の ケーキを ${p.b}こ 買います。代金は 何円 ですか。`, '円') } },
    { id: 'g4mul32-gyuunyuu', u: 'g4mul32', add: 1, make(r) { const p = r.gen('g4mul32');
      return W(p, `1日に ${p.a}mLずつ 牛にゅうを 飲みます。${p.b}日間では 何mL 飲みますか。`, 'mL') } },
    { id: 'g4mul32-ita', u: 'g4mul32', add: 1, make(r) { const p = r.gen('g4mul32');
      return W(p, `1まい ${p.a}gの 板を ${p.b}まい 重ねます。全部の 重さは 何g ですか。`, 'g') } },
    { id: 'g4mul32-enpitsu-wake', u: 'g4mul32', add: 1, make(r) { const p = r.gen('g4div2');
      return W(p, `${p.a}本の えん筆を、${p.b}人に 同じ数ずつ 配ります。1人 何本に なって、何本 あまりますか。`, '本') } },

    /* ===== 5年 ===== */
    { id: 'g5fadd-juice', u: 'g5fadd', add: 1, make(r) { const p = r.frac('+'), n = r.name();
      return W(p, `${n}さんは ジュースを 朝に ${p.a}L、夕方に ${p.b}L 飲みました。あわせて 何L 飲みましたか。`, 'L') } },
    { id: 'g5fadd-ribon', u: 'g5fadd', add: 1, make(r) { const p = r.frac('+');
      return W(p, `赤い リボンが ${p.a}m、青い リボンが ${p.b}m あります。あわせて 何m ですか。`, 'm') } },
    { id: 'g5fadd-hatake', u: 'g5fadd', add: 1, make(r) { const p = r.frac('+');
      return W(p, `畑の ${p.a}に じゃがいもを、${p.b}に たまねぎを 植えました。あわせて 畑の どれだけに 植えましたか。`, '') } },
    { id: 'g5fadd-mizu-nokori', u: 'g5fadd', add: 1, make(r) { const p = r.frac('−');
      return W(p, `水が ${p.a}L あります。そのうち ${p.b}L 使うと、のこりは 何L ですか。`, 'L') } },

    { id: 'g5fsub-komugiko', u: 'g5fsub', add: 1, make(r) { const p = r.frac('−');
      return W(p, `小麦粉が ${p.a}kg あります。ケーキに ${p.b}kg 使いました。のこりは 何kg ですか。`, 'kg') } },
    { id: 'g5fsub-kyori', u: 'g5fsub', add: 1, make(r) { const p = r.frac('−');
      return W(p, `家から 公園までは ${p.a}km、家から 駅までは ${p.b}km あります。ちがいは 何km ですか。`, 'km') } },
    { id: 'g5fsub-jikan', u: 'g5fsub', add: 1, make(r) { const p = r.frac('−');
      return W(p, `${p.a}時間の 自由時間の うち、${p.b}時間 読書を しました。のこりは 何時間 ですか。`, '時間') } },
    { id: 'g5fsub-penki-awase', u: 'g5fsub', add: 1, make(r) { const p = r.frac('+');
      return W(p, `ペンキを 午前に ${p.a}L、午後に ${p.b}L 使いました。この日に 使った ペンキは 何L ですか。`, 'L') } },

    { id: 'g5div2-ringo', u: 'g5div2', add: 1, make(r) { const p = r.gen('g5div2');
      return W(p, `${p.a}この りんごを、1箱に ${p.b}こずつ つめます。何箱 できて、何こ あまりますか。`, '箱') } },
    { id: 'g5div2-group', u: 'g5div2', add: 1, make(r) { const p = r.gen('g5div2');
      return W(p, `${p.a}人の 子どもが、${p.b}人ずつの グループを 作ります。全員が どこかに 入るには、グループは いくつ いりますか。`, 'つ', { final: q1(p) }) } },
    { id: 'g5div2-keshigomu', u: 'g5div2', add: 1, make(r) { const p = r.gen('g5div2');
      return W(p, `${p.a}円 持って います。1こ ${p.b}円の 消しゴムは 何こ 買えますか。`, 'こ', { final: p.ans }) } },

    /* ===== 6年 ===== */
    { id: 'g6fmul-bou', u: 'g6fmul', add: 1, make(r) { const p = r.frac('×');
      return W(p, `1mの 重さが ${p.a}kgの ぼうが あります。この ぼう ${p.b}mの 重さは 何kg ですか。`, 'kg') } },
    { id: 'g6fmul-penki', u: 'g6fmul', add: 1, make(r) { const p = r.frac('×');
      return W(p, `1dLで ${p.a}m²の かべを ぬれる ペンキが あります。このペンキ ${p.b}dLでは 何m² ぬれますか。`, 'm²') } },
    { id: 'g6fmul-aruku', u: 'g6fmul', add: 1, make(r) { const p = r.frac('×'), n = r.name();
      return W(p, `${n}さんは 1時間に ${p.a}km 進む ペースで 歩きます。${p.b}時間では 何km 進みますか。`, 'km') } },
    { id: 'g6fmul-mizu-wari', u: 'g6fmul', add: 1, make(r) { const p = r.frac('÷');
      return W(p, `${p.b}m²の 花だんに、${p.a}Lの 水を まきました。1m²あたり 何Lの 水を まいたことに なりますか。`, 'L') } },

    { id: 'g6fdiv-bou', u: 'g6fdiv', add: 1, make(r) { const p = r.frac('÷');
      return W(p, `${p.b}mで 重さが ${p.a}kgの ぼうが あります。この ぼう 1mの 重さは 何kg ですか。`, 'kg') } },
    { id: 'g6fdiv-penki', u: 'g6fdiv', add: 1, make(r) { const p = r.frac('÷');
      return W(p, `${p.b}dLの ペンキで、${p.a}m²の かべを ぬれました。このペンキ 1dLでは 何m² ぬれますか。`, 'm²') } },
    { id: 'g6fdiv-aruku', u: 'g6fdiv', add: 1, make(r) { const p = r.frac('÷');
      return W(p, `${p.a}kmの 道のりを ${p.b}時間で 歩きました。1時間あたり 何km 歩いたことに なりますか。`, 'km') } },
    { id: 'g6fdiv-abura-kake', u: 'g6fdiv', add: 1, make(r) { const p = r.frac('×');
      return W(p, `1Lの 重さが ${p.a}kgの 油が あります。この油 ${p.b}Lの 重さは 何kg ですか。`, 'kg') } },

    { id: 'g6fadd-kabe', u: 'g6fadd', add: 1, make(r) { const p = r.frac('+');
      return W(p, `かべの ${p.a}を 午前に、${p.b}を 午後に ぬりました。あわせて かべの どれだけを ぬりましたか。`, '') } },
    { id: 'g6fadd-gyuunyuu', u: 'g6fadd', add: 1, make(r) { const p = r.frac('−');
      return W(p, `${p.a}Lの 牛にゅうの うち、${p.b}L 飲みました。のこりは 何L ですか。`, 'L') } },
    { id: 'g6fadd-satou', u: 'g6fadd', add: 1, make(r) { const p = r.frac('−');
      return W(p, `さとうが ${p.a}kg、塩が ${p.b}kg あります。さとうは 塩より 何kg 多いですか。`, 'kg') } },
  ];

  const api = { BANK_VER, WORDS_PER_DAY, NAMES, TEMPLATES: T };
  root.HISSAN_WORDS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
