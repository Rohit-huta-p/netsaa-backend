const set = (arr: string[]) => new Set(arr.map(s => s.toLowerCase()));

export const CRAFT_DICT = set([
  'kathak', 'bharatnatyam', 'kuchipudi', 'odissi', 'mohiniyattam',
  'bollywood', 'classical', 'folk', 'ghazal', 'sufi', 'qawwali',
  'guitar', 'tabla', 'drums', 'vocals', 'piano', 'flute', 'sitar', 'harmonium',
  'dance', 'music', 'actor', 'actress', 'comedian', 'magician', 'dj',
  'rapper', 'beatboxer', 'choreographer', 'theatre', 'mime', 'fusion',
]);

export const EVENT_TYPE_DICT = set([
  'workshop', 'masterclass', 'meetup', 'audition', 'competition',
  'jam', 'festival', 'showcase',
]);

export const GIG_TYPE_DICT = set([
  'sangeet', 'wedding', 'corporate', 'party', 'concert', 'recording',
  'session', 'anchoring', 'playback', 'mehendi',
]);

export const CITY_DICT = set([
  'mumbai', 'pune', 'delhi', 'gurgaon', 'noida', 'bangalore', 'bengaluru',
  'chennai', 'hyderabad', 'kolkata', 'jaipur', 'ahmedabad', 'surat',
  'lucknow', 'kochi', 'goa', 'chandigarh', 'indore', 'bhopal', 'nagpur',
]);

export const MONTH_DICT = set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);
