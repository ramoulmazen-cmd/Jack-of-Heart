import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, suitInk } from '../theme';
import { Card, JackCard, SuitIcon } from '../ui';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';

/**
 * How to play, as a small illustrated book in English or Arabic: a cover with the Jack of Hearts
 * and the contents, then chapters (the basics, a turn step by step, your tools, the Jack, special
 * rules, tips) of one idea per page, each with a still picture made of the game's own cards, faces
 * and buttons. Nothing moves, so it costs a phone nothing to show. The Jack's powers each say WHEN
 * and HOW. Times and counts come from the room's settings, so the pages never contradict the lobby.
 * In Arabic, the game's own button names (Role, Skip, Lifeline…) stay as they appear on screen.
 */
export function HowToPlaySheet({ visible, onClose, settings = {}, secret = false }) {
  // -1 is the cover with the contents; otherwise an index into the pages.
  const [page, setPage] = useState(-1);
  const [lang, setLang] = useLanguage();
  const ar = lang === 'ar';
  const T = ar ? UI_AR : UI_EN;
  const L = (caption) => (ar ? CAPTIONS_AR[caption] ?? caption : caption);
  const pages = pagesFor(secret);
  const close = () => {
    setPage(-1);
    onClose();
  };
  const openChapter = (c) => setPage(pages.findIndex((p) => p.chapter === c));
  const switcher = <LanguageSwitch lang={lang} onChange={setLang} />;

  if (page < 0) {
    const footer = (
      <Pressable
        role="button"
        testID="rules-start"
        aria-label={T.start}
        onPress={() => setPage(0)}
        style={({ pressed }) => [styles.navButton, styles.navNext, styles.start, pressed && styles.pressed]}
      >
        <Text style={[styles.navText, styles.navNextText]}>{T.start}</Text>
      </Pressable>
    );
    return (
      <Sheet visible={visible} onClose={close} title={T.sheet} tall footer={footer}>
        <Contents pages={pages} onOpen={openChapter} ar={ar} T={T} switcher={switcher} />
      </Sheet>
    );
  }

  const index = Math.min(page, pages.length - 1);
  const { slide, chapter, at, of } = pages[index];
  const text = ar ? slide.ar : slide;
  const title = typeof text.title === 'function' ? text.title(settings) : text.title;
  const lines = typeof text.lines === 'function' ? text.lines(settings) : text.lines;
  const last = index === pages.length - 1;
  const rtl = ar && styles.rtl;
  const footer = (
    <View style={[styles.nav, ar && styles.reverse]}>
      <Pressable
        role="button"
        testID="rules-back"
        aria-label={ar ? T.back : 'Previous slide'}
        onPress={() => setPage(index - 1)}
        style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
      >
        <Text style={styles.navText}>{T.back}</Text>
      </Pressable>
      <Pressable
        role="button"
        testID="rules-contents"
        aria-label={T.contents}
        onPress={() => setPage(-1)}
        style={({ pressed }) => [styles.navButton, styles.navContents, pressed && styles.pressed]}
      >
        <Text style={styles.navText}>{T.contents}</Text>
      </Pressable>
      <Pressable
        role="button"
        testID="rules-next"
        aria-label={last ? T.done : ar ? T.next : 'Next slide'}
        onPress={() => (last ? close() : setPage(index + 1))}
        style={({ pressed }) => [styles.navButton, styles.navNext, pressed && styles.pressed]}
      >
        <Text style={[styles.navText, styles.navNextText]}>{last ? T.done : T.next}</Text>
      </Pressable>
    </View>
  );
  return (
    <Sheet visible={visible} onClose={close} title={T.sheet} tall footer={footer}>
      <View style={styles.slide} aria-label={`Slide ${index + 1} of ${pages.length}`}>
        <View style={[styles.where, ar && styles.reverse]}>
          <Text style={[styles.kicker, rtl]}>
            {ar ? `الفصل ${chapter + 1}: ${CHAPTERS[chapter].ar.title}` : `${chapter + 1}. ${CHAPTERS[chapter].title}`}
          </Text>
          <View style={[styles.whereRight, ar && styles.reverse]}>
            <View style={[styles.dots, ar && styles.reverse]} aria-label={`Page ${at + 1} of ${of} in this chapter`}>
              {Array.from({ length: of }, (_, i) => (
                <View key={i} style={[styles.dot, i === at && styles.dotOn]} />
              ))}
            </View>
            {switcher}
          </View>
        </View>
        <Text style={ar ? [styles.titleAr, styles.rtl] : styles.title}>{title}</Text>
        <View style={styles.visual}>{slide.visual(L)}</View>
        {lines.map((line) =>
          typeof line === 'string' ? (
            <Text key={line} style={[styles.line, ar && styles.lineAr, rtl]}>
              {line}
            </Text>
          ) : (
            <View key={line.label} style={[styles.labelled, ar && styles.reverse]}>
              <Text style={[styles.label, ar && styles.labelAr]}>{ar ? LABELS_AR[line.label] : line.label}</Text>
              <Text style={[styles.line, ar && styles.lineAr, styles.labelledText, rtl]}>{line.text}</Text>
            </View>
          ),
        )}
      </View>
    </Sheet>
  );
}

/** English or Arabic, remembered on this phone; an Arabic phone starts in Arabic. */
const LANG_KEY = 'joh.rulesLang';
function useLanguage() {
  const [lang, setLang] = useState(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && /^ar\b/i.test(navigator.language ?? '')) return 'ar';
    return 'en';
  });
  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((saved) => (saved === 'ar' || saved === 'en') && setLang(saved))
      .catch(() => {});
  }, []);
  const choose = (next) => {
    setLang(next);
    AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
  };
  return [lang, choose];
}

function LanguageSwitch({ lang, onChange }) {
  return (
    <View style={styles.switch} role="radiogroup" aria-label="Language">
      {[
        ['en', 'English'],
        ['ar', 'العربية'],
      ].map(([code, name]) => (
        <Pressable
          key={code}
          role="radio"
          aria-checked={lang === code}
          aria-label={name}
          onPress={() => onChange(code)}
          style={({ pressed }) => [styles.switchItem, lang === code && styles.switchOn, pressed && styles.pressed]}
        >
          <Text style={[styles.switchText, lang === code && styles.switchTextOn]}>{name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The cover: the Jack of Hearts, one line on what the game is, and the chapters to jump to. */
function Contents({ pages, onOpen, ar, T, switcher }) {
  return (
    <View style={styles.cover}>
      <View style={styles.coverTop}>{switcher}</View>
      <View style={styles.coverArt}>
        <JackCard size={124} tilt="-4deg" />
      </View>
      <Text style={[styles.coverLine, ar && styles.coverLineAr]}>{T.cover}</Text>
      <View style={styles.chapters}>
        {CHAPTERS.map((ch, c) => {
          const n = pages.filter((p) => p.chapter === c).length;
          const title = ar ? ch.ar.title : ch.title;
          return (
            <Pressable
              key={ch.title}
              role="button"
              aria-label={ar ? `${c + 1}. ${title}` : `Chapter ${c + 1}: ${title}`}
              onPress={() => onOpen(c)}
              style={({ pressed }) => [styles.chapter, ar && styles.reverse, pressed && styles.pressed]}
            >
              <View style={styles.chapterNumber}>
                <Text style={styles.chapterNumberText}>{c + 1}</Text>
              </View>
              <View style={styles.chapterText}>
                <Text style={[styles.chapterTitle, ar && styles.rtl]}>{title}</Text>
                <Text style={[styles.chapterBlurb, ar && styles.rtl]}>{ar ? ch.ar.blurb : ch.blurb}</Text>
              </View>
              <Text style={styles.chapterCount}>{ar ? arPages(n) : n === 1 ? '1 page' : `${n} pages`}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Every page in order, with its chapter and its place in it. The secret page only for those told. */
function pagesFor(secret) {
  const pages = [];
  CHAPTERS.forEach((ch, chapter) => {
    const slides = ch.slides.filter((s) => secret || !s.secret);
    slides.forEach((slide, at) => pages.push({ slide, chapter, at, of: slides.length }));
  });
  return pages;
}

// ---- words around the pages ----

const UI_EN = {
  sheet: 'How to play',
  start: 'Start reading',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  contents: 'Contents',
  cover: 'One of you is the Jack. Find him before he gets you.',
};
const UI_AR = {
  sheet: 'طريقة اللعب',
  start: 'ابدأ القراءة',
  back: 'رجوع',
  next: 'التالي',
  done: 'تم',
  contents: 'الفهرس',
  cover: 'واحد منكم هو الجاك. اكشفه قبل أن يُخرجك.',
};
const LABELS_AR = { When: 'متى', How: 'كيف', Then: 'النتيجة' };

// The small words inside the pictures. Button names (Role, Lifeline, Skip) and the big result
// stamps (ALIVE, DEAD, SAFE) stay in English: that's how they appear in the game.
const CAPTIONS_AR = {
  You: 'أنت',
  hidden: 'مخفية',
  Omar: 'عمر',
  Lina: 'لينا',
  Sara: 'سارة',
  Dan: 'دان',
  'also seen by': 'يراها أيضًا',
  'everyone still in wins': 'يفوز كل من بقي',
  'he survives to the end': 'يبقى حتى النهاية',
  'Omar: your card is': 'عمر: ورقتك هي',
  'Lina: your card is': 'لينا: ورقتك هي',
  'One of them is lying.': 'أحدهما يكذب.',
  'finger down': 'الإصبع عليها',
  'finger up': 'الإصبع مرفوع',
  'Your card is': 'ورقتك هي',
  'I trust you, it’s': 'أثق بك، إنها',
  'colour turn': 'جولة لون',
  'blank turn': 'جولة فارغة',
  'hold 1 s': 'اضغط ثانية',
  real: 'الحقيقية',
  'they see': 'ما يرونه',
  'Omar says': 'عمر يقول',
  'Dan says': 'دان يقول',
  'Never show your screen.': 'لا تُظهر شاشتك أبدًا.',
  'No talking in the cell.': 'ممنوع الكلام في الزنزانة.',
  'The dead stay silent.': 'الخارجون يصمتون.',
};

// ---- the room's numbers, in words ----

/** "Talk (3 min)": the room's own time, or just the name when it isn't known. */
function timed(name, seconds, inMinutes = false) {
  if (typeof seconds !== 'number') return name;
  return `${name} (${inMinutes && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`})`;
}

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function fakeWhen(n) {
  const rest = 'never on his colour or blank turns.';
  if (n === 0) return 'Off in this room: the host set 0 fakes.';
  if (n === 1) return `While choosing, once a game, ${rest}`;
  if (typeof n === 'number') return `While choosing, up to ${n} times a game, ${rest}`;
  return `While choosing, as many times as the lobby shows, ${rest}`;
}

function sightTurns({ colorTurns, blankTurns }) {
  if (typeof colorTurns !== 'number' || typeof blankTurns !== 'number') {
    return 'The lobby shows how many of these turns there are.';
  }
  return `In this room: ${count(colorTurns, 'colour turn')} and ${count(blankTurns, 'blank turn')}. Only the Jack learns which.`;
}

const turnsLeft = (s) => (typeof s.maxTurns === 'number' ? `after turn ${s.maxTurns}` : 'when the last turn is over');

// The same in Arabic, with Arabic's number agreement (1, 2, 3–10, 11+).
const arNumber = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);
const arSeconds = (n) => arNumber(n, 'ثانية واحدة', 'ثانيتان', 'ثوانٍ', 'ثانية');
const arMinutes = (n) => arNumber(n, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة');
const arTimes = (n) => arNumber(n, 'مرة واحدة', 'مرتين', 'مرات', 'مرة');
const arPages = (n) => arNumber(n, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة');

function arTimed(name, seconds, inMinutes = false) {
  if (typeof seconds !== 'number') return name;
  return `${name} (${inMinutes && seconds % 60 === 0 ? arMinutes(seconds / 60) : arSeconds(seconds)})`;
}

function arFakeWhen(n) {
  const rest = 'وليس في جولات اللون أو الجولات الفارغة.';
  if (n === 0) return 'معطّلة في هذه الغرفة: المضيف جعل عددها 0.';
  if (n === 1) return `أثناء الاختيار، مرة واحدة في اللعبة، ${rest}`;
  if (typeof n === 'number') return `أثناء الاختيار، حتى ${arTimes(n)} في اللعبة، ${rest}`;
  return `أثناء الاختيار، بالعدد الظاهر في الردهة، ${rest}`;
}

function arSightTurns({ colorTurns, blankTurns }) {
  if (typeof colorTurns !== 'number' || typeof blankTurns !== 'number') return 'الردهة تُظهر عدد هذه الجولات.';
  return `في هذه الغرفة: جولات اللون ${colorTurns}، والجولات الفارغة ${blankTurns}. الجاك وحده يعرف أيّها.`;
}

const arTurnsLeft = (s) => (typeof s.maxTurns === 'number' ? `بعد الجولة ${s.maxTurns}` : 'عند انتهاء الجولة الأخيرة');

// ---- the pictures: still, made of the game's own pieces ----

const person = (name) => ({ id: name, name, alive: true });

function Named({ name, children, under }) {
  return (
    <View style={styles.named}>
      {children}
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {under ? <Text style={styles.small}>{under}</Text> : null}
    </View>
  );
}

function Badge({ n, alarm = false }) {
  return (
    <View style={[styles.badge, alarm && styles.badgeAlarm]}>
      <Text style={styles.badgeText}>{n}</Text>
    </View>
  );
}

/** A hold button, frozen part way: the bar shows how far the hold has come. */
function MockHold({ label, fill }) {
  return (
    <View style={styles.mockButton}>
      <View style={[styles.mockFill, { width: `${Math.round(fill * 100)}%` }]} />
      <Text style={styles.mockLabel}>{label}</Text>
      <Text style={styles.mockHint}>hold</Text>
    </View>
  );
}

function MiniSuit({ suit }) {
  return (
    <View style={styles.miniSuit}>
      <SuitIcon suit={suit} size={14} color={suitInk(suit)} />
    </View>
  );
}

function Bubble({ text, suit, mine = false }) {
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{text}</Text>
      {suit ? <MiniSuit suit={suit} /> : null}
    </View>
  );
}

/** A big stamped word, like the ones in the middle of the screen after the cell. */
function Stamp({ word, tint }) {
  return <Text style={[styles.stamp, { color: tint, borderColor: tint }]}>{word}</Text>;
}

/** One row of "They see yours": a holder and the suit you noted for what they told you. */
function NoteRow({ name, suit }) {
  return (
    <View style={styles.noteRow}>
      <Avatar player={person(name)} size={26} />
      <Text style={styles.noteName}>{name}</Text>
      {['spades', 'hearts', 'diamonds', 'clubs'].map((s) => (
        <View key={s} style={[styles.noteSuit, s === suit && styles.noteSuitOn]}>
          <SuitIcon suit={s} size={13} color={s === suit ? suitInk(s) : color.faded} />
        </View>
      ))}
    </View>
  );
}

// ---- the chapters ----

const CHAPTERS = [
  {
    title: 'The basics',
    blurb: 'What the game is, and how each side wins.',
    ar: { title: 'الأساسيات', blurb: 'ما هي اللعبة، وكيف يفوز كل طرف.' },
    slides: [
      {
        title: 'One of you is the Jack',
        visual: () => (
          <View style={styles.row}>
            <JackCard size={86} tilt="-6deg" />
            <View style={styles.faces}>
              {['A', 'B', 'C', 'D'].map((n) => (
                <Avatar key={n} player={person(n)} size={34} />
              ))}
            </View>
          </View>
        ),
        lines: [
          'When the game starts, one player is secretly made the Jack. Only that player knows.',
          'Everyone else plays together: find the Jack and get him out before he gets you.',
          'Hold Role to check which one you are. Nobody else can see it.',
        ],
        ar: {
          title: 'واحد منكم هو الجاك',
          lines: [
            'عند بداية اللعبة يُختار لاعب واحد سرًّا ليكون الجاك، ولا يعرف ذلك إلا هو.',
            'بقية اللاعبين فريق واحد: اكشفوا الجاك وأخرجوه قبل أن يُخرجكم.',
            'اضغط مطولًا على زر «Role» لتعرف دورك. لا يراه أحد غيرك.',
          ],
        },
      },
      {
        title: 'You never see your own card',
        visual: (L) => (
          <View style={styles.row}>
            <Named name={L('You')} under={L('hidden')}>
              <Card size={50} back />
            </Named>
            <Named name={L('Omar')}>
              <Card size={50} suit="hearts" />
            </Named>
            <Named name={L('Lina')}>
              <Card size={50} suit="clubs" />
            </Named>
          </View>
        ),
        lines: [
          'Every turn everyone gets a new card: spades, hearts, diamonds or clubs. Repeats are normal.',
          'You can see other people’s cards, never your own.',
          'To survive, you must name your own suit at the end of the turn. So you need others to tell you, and you must decide whom to believe.',
        ],
        ar: {
          title: 'لا ترى ورقتك أبدًا',
          lines: [
            'في كل جولة يحصل كل لاعب على ورقة جديدة: بستوني أو قلب أو ديناري أو سباتي. تكرار الأشكال أمر عادي.',
            'ترى أوراق الآخرين، لكنك لا ترى ورقتك أبدًا.',
            'لتبقى في اللعبة يجب أن تذكر شكل ورقتك في نهاية الجولة، لذلك تحتاج أن يخبرك الآخرون، وعليك أن تقرر من تصدّق.',
          ],
        },
      },
      {
        title: 'How the game ends',
        visual: (L) => (
          <View style={styles.outcomes}>
            <View style={styles.outcome}>
              <Stamp word="JACK OUT" tint={color.paint} />
              <Text style={styles.outcomeText}>{L('everyone still in wins')}</Text>
            </View>
            <View style={styles.outcome}>
              <Stamp word="JACK WINS" tint={color.alarm} />
              <Text style={styles.outcomeText}>{L('he survives to the end')}</Text>
            </View>
          </View>
        ),
        lines: (s) => [
          'The moment the Jack is out, everyone still in the game wins.',
          `The Jack wins if he is still in when only 1 other player is left, or ${turnsLeft(s)}.`,
          'Players who are out stay to watch, in silence.',
        ],
        ar: {
          title: 'كيف تنتهي اللعبة',
          lines: (s) => [
            'لحظة خروج الجاك، يفوز كل من بقي في اللعبة.',
            `يفوز الجاك إذا بقي في اللعبة حتى لا يبقى معه إلا لاعب واحد، أو ${arTurnsLeft(s)}.`,
            'اللاعبون الذين خرجوا يبقون للمشاهدة بصمت.',
          ],
        },
      },
      {
        title: 'Who to trust',
        visual: (L) => (
          <View style={styles.chat}>
            <Bubble text={L('Omar: your card is')} suit="hearts" />
            <Bubble text={L('Lina: your card is')} suit="clubs" />
            <Text style={styles.verdict}>{L('One of them is lying.')}</Text>
          </View>
        ),
        lines: [
          'Everyone who isn’t the Jack wants you alive, so they have every reason to tell you the truth.',
          'The Jack lies to get people out. When two people tell you different suits, someone is lying.',
          'Each lie leaves a trace. Remember who told what: it is how you find him.',
        ],
        ar: {
          title: 'من تصدّق؟',
          lines: [
            'كل من ليس الجاك يريدك أن تبقى، فلديه كل الأسباب ليقول لك الحقيقة.',
            'الجاك يكذب ليُخرج اللاعبين. إذا أخبرك شخصان بشكلين مختلفين، فأحدهما يكذب.',
            'كل كذبة تترك أثرًا. تذكّر من قال ماذا: هكذا تكشفه.',
          ],
        },
      },
    ],
  },
  {
    title: 'A turn, step by step',
    blurb: 'Choose, lights, Plotting, talk, cell, results.',
    ar: { title: 'الجولة خطوة بخطوة', blurb: 'الاختيار، الأضواء، التخطيط، الحديث، الزنزانة، النتائج.' },
    slides: [
      {
        title: 'Choose (20 s)',
        visual: (L) => (
          <View style={styles.row}>
            {['Sara', 'Omar', 'Lina'].map((n, i) => (
              <Named key={n} name={L(n)}>
                <View>
                  <Avatar player={person(L(n))} size={50} />
                  <Badge n={i + 1} />
                </View>
              </Named>
            ))}
          </View>
        ),
        lines: [
          'Rank up to 3 people you trust to see your card, best first, then Lock in. Your ranking stays secret.',
          'Be quick: each person can hold only 2 cards, from the 2 fastest players who chose them. Your card also gets a second viewer at random.',
          'With 4 or fewer players: choose just 1, and nobody is added at random.',
        ],
        ar: {
          title: 'الاختيار (20 ثانية)',
          lines: [
            'رتّب حتى 3 أشخاص تثق بهم ليروا ورقتك، الأفضل أولًا، ثم اضغط «Lock in». ترتيبك يبقى سرًّا.',
            'كن سريعًا: كل شخص يحمل ورقتين فقط، من أسرع لاعبَين اختاراه. ويُضاف لورقتك أيضًا مشاهد ثانٍ عشوائيًا.',
            'إذا كنتم 4 لاعبين أو أقل: اختر شخصًا واحدًا فقط، ولا يُضاف أحد عشوائيًا.',
          ],
        },
      },
      {
        title: 'Lights (3–5 s)',
        visual: (L) => (
          <View style={styles.row}>
            {[['Sara', 'hearts'], ['Omar', 'spades'], ['Lina', 'diamonds'], ['Dan', 'clubs']].map(([n, s]) => (
              <Named key={n} name={L(n)}>
                <Card size={46} suit={s} />
              </Named>
            ))}
          </View>
        ),
        lines: [
          'For a few seconds, every card but yours shows on screen.',
          'Remember what you can. If someone later lies about a card you saw, you will know.',
        ],
        ar: {
          title: 'الأضواء (3 إلى 5 ثوانٍ)',
          lines: [
            'لبضع ثوانٍ تظهر على الشاشة كل الأوراق ما عدا ورقتك.',
            'احفظ ما تستطيع. إذا كذب أحد لاحقًا عن ورقة رأيتها، ستعرف.',
          ],
        },
      },
      {
        title: (s) => timed('Plotting', s.briefingSeconds),
        visual: (L) => (
          <View style={styles.row}>
            {[['Omar', 'Dan'], ['Lina', 'Sara']].map(([n, other]) => (
              <Named key={n} name={L(n)} under={`${L('also seen by')} ${L(other)}`}>
                <Card size={56} back />
              </Named>
            ))}
          </View>
        ),
        lines: [
          'Now you learn whose cards you will hold, who else holds each one ("also seen by"), and who holds yours. Nobody can look at a card yet.',
          'Make deals, set traps, and vote if the interrogation is open. The host sets how long it lasts.',
          'Done early? Tap Skip at the top. It ends as soon as every living player has tapped it.',
        ],
        ar: {
          title: (s) => arTimed('التخطيط', s.briefingSeconds),
          lines: [
            'الآن تعرف أوراق من ستحمل، ومن يحمل كل ورقة معك («also seen by»)، ومن يحمل ورقتك. لا يستطيع أحد رؤية أي ورقة بعد.',
            'اعقد اتفاقات، وانصب فخاخًا، وصوّت إذا كان الاستجواب مفتوحًا. المضيف يحدد مدة هذا الجزء.',
            'انتهيتم مبكرًا؟ اضغط «Skip» في الأعلى. ينتهي هذا الجزء عندما يضغطه كل اللاعبين الأحياء.',
          ],
        },
      },
      {
        title: (s) => timed('Talk', s.discussionSeconds, true),
        visual: (L) => (
          <View style={styles.row}>
            <Named name={L('Omar')} under={L('finger down')}>
              <Card size={60} suit="hearts" />
            </Named>
            <Named name={L('Lina')} under={L('finger up')}>
              <Card size={60} back />
            </Named>
          </View>
        ),
        lines: [
          'Hold one of your cards to look at it. Tell its owner their suit: the truth, or a lie.',
          'Listen to what your two holders tell you about yours, and note it.',
          'Skip works here too: when every living player has tapped it, everyone goes to their cell.',
        ],
        ar: {
          title: (s) => arTimed('الحديث', s.discussionSeconds, true),
          lines: [
            'اضغط مطولًا على إحدى الأوراق التي تحملها لتراها. أخبر صاحبها بشكلها: الحقيقة أو كذبة.',
            'استمع لما يقوله لك حاملا ورقتك، وسجّله.',
            'زر «Skip» يعمل هنا أيضًا: عندما يضغطه كل الأحياء، يذهب الجميع إلى زنزاناتهم.',
          ],
        },
      },
      {
        title: (s) => timed('Cell', s.answerSeconds),
        visual: () => (
          <View style={styles.row}>
            {['spades', 'hearts', 'diamonds', 'clubs'].map((s) => (
              <View key={s} style={s === 'hearts' ? styles.picked : styles.notPicked}>
                <Card size={44} suit={s} />
              </View>
            ))}
          </View>
        ),
        lines: [
          'Alone, name your own suit. Your notes are on screen to help you.',
          'Wrong, or no answer before the clock runs out, and you are out.',
          'No talking in the cell, and no chat: you decide alone.',
        ],
        ar: {
          title: (s) => arTimed('الزنزانة', s.answerSeconds),
          lines: [
            'وحدك، اختر شكل ورقتك. ملاحظاتك على الشاشة لتساعدك.',
            'إذا أخطأت، أو لم تُجب قبل انتهاء الوقت، تخرج من اللعبة.',
            'ممنوع الكلام في الزنزانة ولا دردشة: تقرر وحدك.',
          ],
        },
      },
      {
        title: 'Results',
        visual: () => (
          <View style={styles.row}>
            <Stamp word="ALIVE" tint={color.paint} />
            <Stamp word="DEAD" tint={color.alarm} />
            <Stamp word="SAFE" tint={color.chalk} />
          </View>
        ),
        lines: [
          'Everyone sees ALIVE or DEAD, and the faces show who is still in.',
          'SAFE means it was the secret safe turn: nobody died, whatever they answered.',
          'Then a new turn starts with Choose, and everyone gets a new card.',
        ],
        ar: {
          title: 'النتائج',
          lines: [
            'يرى كل لاعب ALIVE (بقيت) أو DEAD (خرجت)، والصور تُظهر من بقي في اللعبة.',
            'وتعني SAFE أنها كانت الجولة الآمنة السرية: لم يخرج أحد مهما كانت إجابته.',
            'ثم تبدأ جولة جديدة بالاختيار، ويحصل الجميع على أوراق جديدة.',
          ],
        },
      },
    ],
  },
  {
    title: 'Your tools',
    blurb: 'Role, lifeline, notes, private chat and skip.',
    ar: { title: 'أدواتك', blurb: 'الدور، طوق النجاة، الملاحظات، الدردشة الخاصة، والتخطي.' },
    slides: [
      {
        title: 'Role',
        visual: () => (
          <View style={styles.row}>
            <MockHold label="Role" fill={1} />
            <JackCard size={52} tilt="0deg" faceDown />
          </View>
        ),
        lines: [
          { label: 'When', text: 'While choosing, in Plotting and in the talk.' },
          { label: 'How', text: 'Hold Role: your card shows who you are. Let go and it hides again.' },
          'Hold it out of sight of the others. For the Jack it also shows his sight this turn and what his fake did.',
        ],
        ar: {
          title: 'الدور («Role»)',
          lines: [
            { label: 'When', text: 'أثناء الاختيار، وفي التخطيط، وفي الحديث.' },
            { label: 'How', text: 'اضغط مطولًا على «Role»: تظهر ورقتك وتُخبرك بدورك. ارفع إصبعك فتختفي.' },
            'افعل ذلك بعيدًا عن أعين الآخرين. وللجاك تُظهر أيضًا ما يستطيع رؤيته في هذه الجولة، وما فعلته خدعته.',
          ],
        },
      },
      {
        title: 'Lifeline',
        visual: () => (
          <View style={styles.row}>
            <MockHold label="Lifeline" fill={0.6} />
            <Card size={52} suit="diamonds" />
          </View>
        ),
        lines: [
          { label: 'When', text: 'In your cell, once a game, never on the last turn.' },
          { label: 'How', text: 'Hold Lifeline until the bar fills: your own card shows for a second.' },
          'Keep it for a turn when you really don’t know whom to believe.',
        ],
        ar: {
          title: 'طوق النجاة («Lifeline»)',
          lines: [
            { label: 'When', text: 'في زنزانتك، مرة واحدة في اللعبة، وليس في الجولة الأخيرة.' },
            { label: 'How', text: 'اضغط مطولًا على «Lifeline» حتى يمتلئ الشريط: تظهر ورقتك لثانية.' },
            'احتفظ به لجولة لا تعرف فيها حقًا من تصدّق.',
          ],
        },
      },
      {
        title: 'Notes',
        visual: (L) => (
          <View style={styles.notes}>
            <NoteRow name={L('Omar')} suit="hearts" />
            <NoteRow name={L('Lina')} suit="clubs" />
          </View>
        ),
        lines: [
          'In the talk, under "They see yours", tap the suit each holder told you.',
          'Tap Notes to write anything else down: a promise, a suspicion, a lie you caught.',
          'In your cell all of it is on screen, so you can decide.',
        ],
        ar: {
          title: 'الملاحظات («Notes»)',
          lines: [
            'في الحديث، تحت «They see yours»، اضغط الشكل الذي أخبرك به كل حامل لورقتك.',
            'اضغط «Notes» لتكتب أي شيء آخر: وعدًا، أو شكًّا، أو كذبة كشفتها.',
            'في زنزانتك يظهر كل ذلك على الشاشة لتقرر.',
          ],
        },
      },
      {
        title: 'Private chat',
        visual: (L) => (
          <View style={styles.chat}>
            <Bubble mine text={L('Your card is')} suit="hearts" />
            <Bubble text={L('I trust you, it’s')} suit="clubs" />
          </View>
        ),
        lines: (s) => [
          'Tap Chat to message any living player. Only the two of you ever see it. 10 words at most: tap ready phrases and suit buttons.',
          s.talkChat !== true
            ? 'Open while choosing and in Plotting. In this room it’s closed in the talk: talk to each other. Closed in your cell too.'
            : 'Open while choosing, in Plotting and in the talk. Closed in your cell; the dead stay silent.',
          ...(s.talkChat !== true
            ? []
            : [
                s.voiceChat
                  ? 'Voice messages are on: during the talk, tap Voice (where Send is), talk, then Send. 20 s at most.'
                  : 'The host can also switch on voice messages for the talk, for games played apart.',
              ]),
        ],
        ar: {
          title: 'الدردشة الخاصة («Chat»)',
          lines: (s) => [
            'اضغط «Chat» لتراسل أي لاعب حي. لا يرى المحادثة إلا أنتما. 10 كلمات كحد أقصى: استعمل العبارات الجاهزة وأزرار الأشكال.',
            s.talkChat !== true
              ? 'مفتوحة أثناء الاختيار وفي التخطيط. في هذه الغرفة هي مغلقة أثناء الحديث: تكلموا مع بعضكم. ومغلقة في الزنزانة أيضًا.'
              : 'مفتوحة أثناء الاختيار وفي التخطيط وفي الحديث. مغلقة في الزنزانة، والخارجون من اللعبة يصمتون.',
            ...(s.talkChat !== true
              ? []
              : [
                  s.voiceChat
                    ? 'الرسائل الصوتية مفعّلة: أثناء الحديث اضغط «Voice» (مكان «Send»)، تكلّم، ثم أرسل. 20 ثانية كحد أقصى.'
                    : 'يستطيع المضيف أيضًا تفعيل الرسائل الصوتية أثناء الحديث، للّعب عن بُعد.',
                ]),
          ],
        },
      },
      {
        title: 'Skip',
        visual: () => (
          <View style={styles.row}>
            <View style={styles.skipPill}>
              <Text style={styles.skipText}>Skip 3/5</Text>
            </View>
            <View style={[styles.skipPill, styles.skipPillOn]}>
              <Text style={[styles.skipText, styles.skipTextOn]}>Skip 5/5</Text>
            </View>
          </View>
        ),
        lines: [
          'In Plotting and in the talk, Skip at the top shows how many want to move on.',
          'It moves on only when every living player has tapped it. Tap again to take yours back.',
          'Nobody can skip alone, not even the host.',
        ],
        ar: {
          title: 'التخطي («Skip»)',
          lines: [
            'في التخطيط والحديث، يُظهر زر «Skip» في الأعلى كم لاعبًا يريد الانتقال.',
            'لا يتم الانتقال إلا عندما يضغطه كل اللاعبين الأحياء. اضغطه مرة أخرى لتسحب ضغطتك.',
            'لا أحد يستطيع التخطي وحده، ولا حتى المضيف.',
          ],
        },
      },
    ],
  },
  {
    title: 'The Jack',
    blurb: 'What he can’t see, and his tricks.',
    ar: { title: 'الجاك', blurb: 'ما لا يستطيع رؤيته، وحيله.' },
    slides: [
      {
        title: 'Playing as the Jack',
        visual: () => (
          <View style={styles.row}>
            <JackCard size={64} tilt="-4deg" faceDown marked />
            <MockHold label="Role" fill={1} />
          </View>
        ),
        lines: [
          'Holding Role, you see his face in the heart: you are the Jack.',
          'You don’t see your own card either, and you must name your suit in the cell like everyone.',
          'Tell the truth when it earns trust, lie when it gets someone out, and never get caught.',
        ],
        ar: {
          title: 'عندما تكون الجاك',
          lines: [
            'عند الضغط على «Role» ترى وجهه داخل القلب: أنت الجاك.',
            'أنت أيضًا لا ترى ورقتك، ويجب أن تذكر شكلها في الزنزانة مثل الجميع.',
            'قل الحقيقة عندما تكسبك الثقة، واكذب عندما تُخرج أحدًا، ولا تُكشف أبدًا.',
          ],
        },
      },
      {
        title: 'He can’t always see',
        visual: (L) => (
          <View style={styles.row}>
            <Named name={L('colour turn')}>
              <Card size={58} suit="red" />
            </Named>
            <Named name={L('blank turn')}>
              <Card size={58} suit="blank" />
            </Named>
          </View>
        ),
        lines: (s) => [
          'On some secret turns the Jack sees only red or black, or one of his cards is blank.',
          'He still has to tell those players something. A wrong suit in the right colour is his signature.',
          sightTurns(s),
        ],
        ar: {
          title: 'لا يرى دائمًا',
          lines: (s) => [
            'في بعض الجولات السرية لا يرى الجاك إلا اللون (أحمر أو أسود)، أو تكون إحدى أوراقه فارغة.',
            'ومع ذلك عليه أن يقول لأصحابها شيئًا. شكل خاطئ باللون الصحيح هو توقيعه.',
            arSightTurns(s),
          ],
        },
      },
      {
        title: 'Fake',
        visual: (L) => (
          <View style={styles.row}>
            <Named name={L('hold 1 s')}>
              <View style={styles.holdRing}>
                <Avatar player={person(L('Lina'))} size={50} />
              </View>
            </Named>
            <Text style={styles.arrow}>→</Text>
            <Named name={L('real')}>
              <Card size={44} suit="hearts" />
            </Named>
            <Text style={styles.arrow}>→</Text>
            <Named name={L('they see')}>
              <Card size={44} suit="clubs" />
            </Named>
          </View>
        ),
        lines: (s) => [
          { label: 'When', text: fakeWhen(s.fakeSuits) },
          { label: 'How', text: 'Hold a player’s picture for 1 second.' },
          {
            label: 'Then',
            text: 'One person holding that card sees a false suit and passes it on in good faith. Holding Role tells the Jack who got the false suit, never which suit.',
          },
        ],
        ar: {
          title: 'الخدعة («Fake»)',
          lines: (s) => [
            { label: 'When', text: arFakeWhen(s.fakeSuits) },
            { label: 'How', text: 'اضغط مطولًا على صورة لاعب لثانية واحدة.' },
            {
              label: 'Then',
              text: 'أحد حاملي تلك الورقة يرى شكلًا مزيفًا وينقله بحسن نية. وزر «Role» يُخبر الجاك من رأى الشكل المزيف، لكن ليس أي شكل.',
            },
          ],
        },
      },
      {
        // The Jack's secret power: only the host's phone and the Jack's are shown this page.
        secret: true,
        title: 'Blackout (secret)',
        visual: () => (
          <View style={styles.row}>
            <View style={styles.goldFrame}>
              <JackCard size={60} tilt="0deg" faceDown marked />
            </View>
            <MockHold label="Role" fill={1} />
          </View>
        ),
        lines: [
          { label: 'When', text: 'During the talk, once a game, never on the last turn.' },
          { label: 'How', text: 'Hold Role and keep holding about 2 seconds, until the gold frame closes round his card.' },
          { label: 'Then', text: 'In that cell every other lifeline fails. His own still works.' },
          'Only the host and the Jack see this page. Don’t read it out.',
        ],
        ar: {
          title: 'التعتيم (سري)',
          lines: [
            { label: 'When', text: 'أثناء الحديث، مرة واحدة في اللعبة، وليس في الجولة الأخيرة.' },
            { label: 'How', text: 'اضغط مطولًا على «Role» واستمر نحو ثانيتين، حتى يكتمل الإطار الذهبي حول ورقته.' },
            { label: 'Then', text: 'في تلك الزنزانة يفشل طوق النجاة عند الجميع، أما طوقه فيعمل.' },
            'هذه الصفحة لا يراها إلا المضيف والجاك. لا تقرأها بصوت عالٍ.',
          ],
        },
      },
    ],
  },
  {
    title: 'Special rules',
    blurb: 'The interrogation vote and the safe turn.',
    ar: { title: 'قواعد خاصة', blurb: 'تصويت الاستجواب والجولة الآمنة.' },
    slides: [
      {
        title: 'Interrogation vote',
        visual: (L) => (
          <View style={styles.row}>
            {[['Omar', 3], ['Lina', 1], ['Dan', 0]].map(([n, v]) => (
              <Named key={n} name={L(n)}>
                <View>
                  <Avatar player={person(L(n))} size={46} />
                  {v ? <Badge n={v} alarm={n === 'Omar'} /> : null}
                </View>
              </Named>
            ))}
          </View>
        ),
        lines: (s) => [
          {
            label: 'When',
            text:
              s.interrogation === false
                ? 'Off in this room.'
                : 'During Plotting, once a game, with 5 or more players left: after a first half with no deaths, or in the last 3 turns.',
          },
          { label: 'How', text: 'Tap a name to vote. If more than half of the players pick the same name, that player goes alone.' },
          { label: 'Then', text: 'Their card is swapped for one nobody has seen, nobody holds it, and no lifeline. Vote out the one you don’t trust.' },
        ],
        ar: {
          title: 'تصويت الاستجواب',
          lines: (s) => [
            {
              label: 'When',
              text:
                s.interrogation === false
                  ? 'معطّل في هذه الغرفة.'
                  : 'في التخطيط، مرة واحدة في اللعبة، مع 5 لاعبين أو أكثر: بعد نصف أول لم يخرج فيه أحد، أو في الجولات الثلاث الأخيرة.',
            },
            { label: 'How', text: 'اضغط على اسم لتصوّت. إذا اختار أكثر من نصف اللاعبين الاسم نفسه، يذهب ذلك اللاعب وحده.' },
            { label: 'Then', text: 'تُستبدل ورقته بورقة لم يرها أحد، ولا يحملها أحد، ولا طوق نجاة له. صوّت على من لا تثق به.' },
          ],
        },
      },
      {
        title: 'Safe turn',
        visual: () => <Text style={styles.safe}>SAFE</Text>,
        lines: (s) => [
          'One secret turn where nobody dies, whatever they answer. It is never the last turn.',
          s.safeTurn === false ? 'Off in this room: every turn counts.' : 'You find out after the cell. The host can switch it off.',
        ],
        ar: {
          title: 'الجولة الآمنة',
          lines: (s) => [
            'جولة سرية واحدة لا يخرج فيها أحد مهما كانت إجابته، ولا تكون أبدًا الجولة الأخيرة.',
            s.safeTurn === false ? 'معطّلة في هذه الغرفة: كل الجولات تُحتسب.' : 'تعرفون ذلك بعد الزنزانة. ويمكن للمضيف إيقافها.',
          ],
        },
      },
    ],
  },
  {
    title: 'Tips and fair play',
    blurb: 'How to catch the Jack, and the house rules.',
    ar: { title: 'نصائح ولعب نظيف', blurb: 'كيف تكشف الجاك، وقواعد اللعب.' },
    slides: [
      {
        title: 'How to catch the Jack',
        visual: (L) => (
          <View style={styles.row}>
            <Named name={L('Omar says')}>
              <Card size={50} suit="hearts" />
            </Named>
            <Text style={styles.versus}>≠</Text>
            <Named name={L('Dan says')}>
              <Card size={50} suit="clubs" />
            </Named>
          </View>
        ),
        lines: [
          'Your card has two holders. If they tell you different suits, one of them is lying, or was fooled by a fake.',
          'Check with "also seen by": the other holder of a card can confirm what its owner was told.',
          'Watch who told the people who died. A wrong suit in the right colour points to the Jack.',
          'Vote the one you suspect into interrogation, and choose people you trust to hold your card.',
        ],
        ar: {
          title: 'كيف تكشف الجاك',
          lines: [
            'ورقتك يحملها شخصان. إذا أخبراك بشكلين مختلفين فأحدهما يكذب، أو خُدع بخدعة الجاك.',
            'تحقّق عبر «also seen by»: الحامل الآخر للورقة يمكنه تأكيد ما قيل لصاحبها.',
            'انتبه لمن أخبر الذين خرجوا. شكل خاطئ باللون الصحيح يشير إلى الجاك.',
            'صوّت لإرسال من تشك فيه إلى الاستجواب، واختر من تثق بهم ليحملوا ورقتك.',
          ],
        },
      },
      {
        title: 'Play fair',
        visual: (L) => (
          <View style={styles.rules}>
            {['Never show your screen.', 'No talking in the cell.', 'The dead stay silent.'].map((r) => (
              <Text key={r} style={styles.rule}>
                {L(r)}
              </Text>
            ))}
          </View>
        ),
        lines: ['These three rules keep the game fair. The game can’t check them: you do.'],
        ar: {
          title: 'العب بنزاهة',
          lines: ['هذه القواعد الثلاث تحفظ عدالة اللعبة. اللعبة لا تستطيع مراقبتها: أنتم من يفعل ذلك.'],
        },
      },
    ],
  },
];

const styles = StyleSheet.create({
  slide: { gap: 8, paddingBottom: 8 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  reverse: { flexDirection: 'row-reverse' },
  where: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  whereRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kicker: { color: color.paint, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.wallLine },
  dotOn: { backgroundColor: color.paint, width: 18 },
  title: { fontFamily: font.stencil, color: color.chalk, fontSize: 32, lineHeight: 36, marginTop: -2 },
  // The stencil face has no Arabic letters: Arabic titles use the phone's own bold face.
  titleAr: { color: color.chalk, fontSize: 27, lineHeight: 38, fontWeight: '900' },
  visual: {
    minHeight: 150,
    borderRadius: 18,
    backgroundColor: color.wall,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    marginVertical: 4,
  },
  line: { color: color.chalk, fontSize: 15, lineHeight: 21 },
  // Arabic letters need a little more room between lines.
  lineAr: { fontSize: 16, lineHeight: 27 },
  labelled: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: {
    width: 46,
    color: color.ink,
    backgroundColor: color.paint,
    borderRadius: 6,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 3,
    marginTop: 1,
  },
  labelAr: { width: 58, fontSize: 13, marginTop: 4 },
  labelledText: { flex: 1 },

  // The language switch.
  switch: { flexDirection: 'row', borderRadius: 12, borderWidth: 1.5, borderColor: color.wallLine, overflow: 'hidden' },
  switchItem: { paddingHorizontal: 10, paddingVertical: 5 },
  switchOn: { backgroundColor: color.paint },
  switchText: { color: color.chalk, fontSize: 13, fontWeight: '800' },
  switchTextOn: { color: color.ink },

  // The cover.
  cover: { gap: 14, paddingBottom: 8 },
  coverTop: { alignItems: 'center' },
  coverArt: { alignItems: 'center', paddingTop: 6, paddingBottom: 6 },
  coverLine: { color: color.chalk, fontSize: 17, lineHeight: 24, textAlign: 'center', fontWeight: '700' },
  coverLineAr: { fontSize: 18, lineHeight: 30, writingDirection: 'rtl' },
  chapters: { gap: 8 },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: color.wall,
    borderWidth: 1,
    borderColor: color.wallLine,
  },
  chapterNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumberText: { fontFamily: font.stencil, color: color.paint, fontSize: 18, lineHeight: 22 },
  chapterText: { flex: 1, gap: 2 },
  chapterTitle: { color: color.chalk, fontSize: 16, fontWeight: '800' },
  chapterBlurb: { color: color.faded, fontSize: 13, lineHeight: 18 },
  chapterCount: { color: color.faded, fontSize: 12, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' },
  faces: { flexDirection: 'row', flexWrap: 'wrap', width: 80, gap: 6, justifyContent: 'center' },
  named: { alignItems: 'center', gap: 4, maxWidth: 96 },
  name: { color: color.chalk, fontSize: 12, fontWeight: '700' },
  small: { color: color.faded, fontSize: 11, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    backgroundColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.wall,
  },
  badgeAlarm: { backgroundColor: color.alarm },
  badgeText: { fontFamily: font.stencil, color: color.ink, fontSize: 14, lineHeight: 17 },
  picked: { borderRadius: 8, borderWidth: 3, borderColor: color.paint, transform: [{ translateY: -8 }] },
  notPicked: { opacity: 0.55 },
  mockButton: {
    width: 130,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mockFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.paint, opacity: 0.28 },
  mockLabel: { fontFamily: font.stencil, color: color.paint, fontSize: 20, lineHeight: 24 },
  mockHint: { color: color.faded, fontSize: 10, fontWeight: '700', marginTop: -2 },
  holdRing: { borderRadius: 40, borderWidth: 3, borderColor: color.paint, padding: 3 },
  goldFrame: { borderWidth: 3, borderColor: color.goldLight, borderRadius: 12, padding: 6 },
  arrow: { color: color.paint, fontSize: 24, fontWeight: '900' },
  versus: { color: color.alarm, fontSize: 34, fontWeight: '900' },
  chat: { alignSelf: 'stretch', gap: 8 },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '85%' },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: color.paint, borderBottomRightRadius: 5 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: color.wallRaised, borderBottomLeftRadius: 5 },
  bubbleText: { color: color.chalk, fontSize: 15 },
  bubbleTextMine: { color: color.ink },
  verdict: { color: color.alarm, fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  miniSuit: {
    width: 22,
    height: 24,
    borderRadius: 5,
    backgroundColor: color.stock,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    fontFamily: font.stencil,
    fontSize: 26,
    lineHeight: 30,
    borderWidth: 3,
    paddingHorizontal: 8,
    transform: [{ rotate: '-4deg' }],
  },
  outcomes: { flexDirection: 'row', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  outcome: { alignItems: 'center', gap: 8, maxWidth: 140 },
  outcomeText: { color: color.faded, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  notes: { alignSelf: 'stretch', gap: 8 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteName: { color: color.chalk, fontSize: 14, fontWeight: '800', flex: 1 },
  noteSuit: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteSuitOn: { backgroundColor: color.stock, borderColor: color.stock },
  skipPill: { borderWidth: 1.5, borderColor: color.paint, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  skipPillOn: { backgroundColor: color.paint },
  skipText: { color: color.paint, fontSize: 16, fontWeight: '800' },
  skipTextOn: { color: color.ink },
  safe: {
    fontFamily: font.stencil,
    color: color.paint,
    fontSize: 72,
    lineHeight: 78,
    borderWidth: 4,
    borderColor: color.paint,
    paddingHorizontal: 18,
    transform: [{ rotate: '-5deg' }],
  },
  rules: { gap: 10, alignItems: 'center' },
  rule: { color: color.alarm, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navContents: { flex: 1.2 },
  navNext: { backgroundColor: color.paint, borderColor: color.paint },
  start: { flex: 0, alignSelf: 'stretch' },
  navText: { color: color.chalk, fontSize: 16, fontWeight: '800' },
  navNextText: { color: color.ink },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
