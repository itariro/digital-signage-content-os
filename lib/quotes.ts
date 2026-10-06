export const QUOTES: { text: string; author: string }[] = [
  { text: 'Keep your face always toward the sunshine, and shadows will fall behind you.', author: 'Walt Whitman' },
  { text: 'Where there is love there is life.', author: 'Mahatma Gandhi' },
  { text: 'Adopt the pace of nature: her secret is patience.', author: 'Ralph Waldo Emerson' },
  { text: 'Not all those who wander are lost.', author: 'J. R. R. Tolkien' },
  { text: 'In every walk with nature one receives far more than he seeks.', author: 'John Muir' },
  { text: 'The most wasted of all days is one without laughter.', author: 'E. E. Cummings' },
  { text: 'Happiness is not something ready made. It comes from your own actions.', author: 'Dalai Lama' },
  { text: 'We do not remember days, we remember moments.', author: 'Cesare Pavese' },
  { text: 'Look deep into nature, and then you will understand everything better.', author: 'Albert Einstein' },
  { text: 'Wherever you go, go with all your heart.', author: 'Confucius' },
  { text: 'The earth has music for those who listen.', author: 'George Santayana' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'There is no place like home.', author: 'L. Frank Baum' },
  { text: 'A day without sunshine is like, you know, night.', author: 'Steve Martin' },
  { text: 'To love and be loved is to feel the sun from both sides.', author: 'David Viscott' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'The best is yet to come.', author: 'Robert Browning' },
  { text: 'Life is either a daring adventure or nothing at all.', author: 'Helen Keller' },
  { text: 'Every moment is a fresh beginning.', author: 'T. S. Eliot' },
  { text: 'Turn your wounds into wisdom.', author: 'Oprah Winfrey' },
  { text: 'Dwell on the beauty of life. Watch the stars, and see yourself running with them.', author: 'Marcus Aurelius' },
]

export function quoteForDate(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return QUOTES[(dayOfYear + date.getFullYear()) % QUOTES.length]
}
