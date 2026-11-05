import type { Topic } from './types';
import t6 from './t6';
import t7 from './t7';
import t8 from './t8';
import t9 from './t9';
import t10 from './t10';

export const TOPICS: Topic[] = [t6, t7, t8, t9, t10];
export const topicByN = (n: number) => TOPICS.find((t) => t.n === n);
