import { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Panel } from '@/components/ui/misc';
import { useSalaryData } from '@/data/useSalary';
import { daysBetween, todayISO } from '@/lib/dates';
import { money } from '@/lib/format';

export function SalaryAiCard() {
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const { profiles, profileSummaries, familySummary } = useSalaryData(currentMonth);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: 'Привет! Я финансовый AI-помощник FinTrack-AI. Вы можете спросить меня о зарплатах, прогнозах, испытательном сроке или последствиях пропуска дней.',
    },
  ]);

  const myProfile = profiles.find(p => p.name.toLowerCase().includes('моя') || p.schedule_type === '5/2');
  const girlProfile = profiles.find(p => p.name.toLowerCase().includes('девушк') || p.schedule_type === '2/2');

  const mySummary = myProfile ? profileSummaries.get(myProfile.id) : null;
  const girlSummary = girlProfile ? profileSummaries.get(girlProfile.id) : null;

  const sampleQuestions = [
    'Сколько я заработаю в этом месяце?',
    'Сколько мы вместе заработаем?',
    'Когда у меня закончится испытательный срок?',
    'Сколько я потеряю, если пропущу 2 рабочих дня?',
    'Сколько я получу после испытательного срока?',
    'Сколько часов мне нужно отработать, чтобы получить 100 000 ₽?',
  ];

  const handleAsk = (q: string) => {
    if (!q.trim()) return;
    const userText = q.trim();
    const normalized = userText.toLowerCase();

    let reply = '';

    if (normalized.includes('сколько я заработаю') || normalized.includes('мой доход')) {
      reply = `По вашему профилю «${myProfile?.name ?? 'Моя работа'}» (график 5/2):\n• Уже начислено: ${money(mySummary?.totalEarnedSoFar ?? 0)}\n• Ожидается до конца месяца: ${money(mySummary?.futureForecast ?? 0)}\n• Итоговый прогноз за ${currentMonth}: ${money(mySummary?.monthTotalForecast ?? 0)}`;
    } else if (normalized.includes('вместе') || normalized.includes('семь') || normalized.includes('общий доход')) {
      reply = `Общий доход семьи за ${currentMonth}:\n• Вы: ${money(mySummary?.monthTotalForecast ?? 0)}\n• Девушка: ${money(girlSummary?.monthTotalForecast ?? 0)}\n• Всего прогноз дохода семьи: ${money(familySummary.forecast)}`;
    } else if (normalized.includes('испытательн') || normalized.includes('ставка 497')) {
      if (myProfile?.probation_end_date) {
        const d = daysBetween(today, myProfile.probation_end_date);
        if (d > 0) {
          reply = `Испытательный срок заканчивается ${myProfile.probation_end_date} (осталось ${d} дн.). После этого ваша ставка автоматически переключится с 442 ₽/ч на 497 ₽/ч (+440 ₽ за каждую 8-часовую смену).`;
        } else {
          reply = `Ваш испытательный срок уже завершён (${myProfile.probation_end_date}). Текущая ставка составляет 497 ₽/час (3 976 ₽ за 8-часовой рабочий день).`;
        }
      } else {
        reply = 'В настройках вашего профиля дата окончания испытательного срока не задана.';
      }
    } else if (normalized.includes('пропущ') || normalized.includes('потеряю')) {
      const rate = myProfile?.settings?.hourly_rate ?? 497;
      const hours = myProfile?.hours_per_day ?? 8;
      const oneDayLoss = rate * hours;
      const twoDaysLoss = oneDayLoss * 2;
      reply = `При пропуске 2 рабочих дней (по ${hours} ч) вы потеряете 2 × ${hours} ч × ${rate} ₽ = ${money(twoDaysLoss)}. Если пропущен 1 день — потеря составит ${money(oneDayLoss)}.`;
    } else if (normalized.includes('после испытательного')) {
      const hours = (mySummary?.totalHours || 168);
      const afterTotal = hours * 497;
      reply = `После испытательного срока ставка составляет 497 ₽/час (3 976 ₽ за 8-часовой день). За стандартный месяц из ${hours} рабочих часов вы получите ${money(afterTotal)} (+${money(hours * 55)} разницы по сравнению со ставкой испытательного срока 442 ₽).`;
    } else if (normalized.includes('100 000') || normalized.includes('100000')) {
      const rate = myProfile?.settings?.hourly_rate ?? 497;
      const hoursNeeded = Math.ceil(100000 / rate);
      const daysNeeded = Math.ceil(hoursNeeded / (myProfile?.hours_per_day || 8));
      reply = `При текущей ставке ${rate} ₽/час, чтобы заработать 100 000 ₽, вам потребуется отработать ровно ${hoursNeeded} часов (примерно ${daysNeeded} рабочих смен по 8 часов).`;
    } else if (normalized.includes('3 месяца') || normalized.includes('следующ')) {
      const avgMonth = familySummary.forecast || 150000;
      reply = `Ориентировочный прогноз вашего семейного дохода за следующие 3 месяца: ~${money(avgMonth * 3)} (исходя из текущего графика и ставок).`;
    } else {
      reply = `Я проанализировал ваши данные: текущий прогноз семейного дохода составляет ${money(familySummary.forecast)} (вы: ${money(mySummary?.monthTotalForecast ?? 0)}, девушка: ${money(girlSummary?.monthTotalForecast ?? 0)}). Если нужно рассчитать конкретный сценарий, выберите одну из подсказок ниже!`;
    }

    setMessages(prev => [...prev, { sender: 'user', text: userText }, { sender: 'ai', text: reply }]);
    setQuestion('');
  };

  return (
    <Panel label="AI-ассистент по зарплатам и доходам" screw>
      <div className="flex flex-col gap-3">
        {/* Chat message stream */}
        <div className="max-h-[280px] space-y-2.5 overflow-y-auto rounded-[2px] border border-line bg-rail/30 p-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan/20 text-cyan">
                  <Bot size={13} />
                </div>
              )}
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-[2px] px-3 py-2 text-[12px] leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-amber/20 text-txt'
                    : 'border border-line bg-panel text-dim'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Suggested Prompts */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {sampleQuestions.map((sq, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleAsk(sq)}
              className="rounded-[2px] border border-line bg-panel px-2.5 py-1 text-left text-[11px] text-mute transition-colors hover:border-amber/50 hover:text-txt"
            >
              {sq}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="mt-1 flex gap-2">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk(question)}
            placeholder="Задайте вопрос AI о вашей зарплате..."
            className="flex-1 text-[12.5px]"
          />
          <Button variant="primary" onClick={() => handleAsk(question)}>
            <Send size={14} /> Спросить
          </Button>
        </div>
      </div>
    </Panel>
  );
}
