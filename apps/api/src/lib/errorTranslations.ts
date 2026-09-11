import {
  CORNICE_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  PAYROLL_RECORD_STATUS_LABELS,
  PAYROLL_SCHEME_TYPE_LABELS,
  PHOTO_STAGE_LABELS,
  ROLE_LABELS,
  transitionLabel,
  type Locale,
  type Translated,
} from '@curtain-crm/shared';

/**
 * Перевод сообщений об ошибках для клиента на узбекском.
 *
 * Ошибки в коде пишутся по-русски, как и раньше, — в 230 местах, и менять
 * каждое на ключ словаря значило бы переписать все роутеры ради одной
 * локали. Вместо этого сообщение переводится на выходе, в `errorFormatter`,
 * по таблице «русский текст → узбекский» — так же, как gettext переводит по
 * исходной строке.
 *
 * Цена такого подхода — таблица должна знать каждый текст. Чтобы правка
 * русского сообщения не оставила узбекскую швею с русской ошибкой молча,
 * `errorTranslations.test.ts` сверяет таблицу с исходниками: новая или
 * изменённая строка без перевода роняет тест.
 *
 * Сообщения с подстановками (`Филиал «${name}» уже существует`) описаны
 * шаблонами с `{плейсхолдерами}`: русский шаблон превращается в регулярное
 * выражение, захваченные куски подставляются в узбекский. Если захваченный
 * кусок — русская подпись из справочника (статус, роль, стадия), он тоже
 * переводится.
 */

/* -------------------------------------------------------------------------- */
/*  Точные соответствия                                                       */
/* -------------------------------------------------------------------------- */

const EXACT: Readonly<Record<string, string>> = {
  // lib/schemas.ts
  'Укажите номер телефона': "Telefon raqamini ko'rsating",
  'Некорректный номер. Формат: +998 90 123 45 67': "Noto'g'ri raqam. Format: +998 90 123 45 67",
  'Поле обязательно для заполнения': "Maydonni to'ldirish shart",
  'Опишите причину подробнее — минимум 3 символа': 'Sababni batafsilroq yozing — kamida 3 ta belgi',
  'Сумма не может быть отрицательной': "Summa manfiy bo'lishi mumkin emas",
  'Сумма слишком велика': 'Summa juda katta',

  // lib/zodMessages.ts
  'Поле обязательно': 'Maydon majburiy',
  'Поле не может быть пустым': "Maydon bo'sh bo'lishi mumkin emas",
  'Недопустимое значение': "Yo'l qo'yilmaydigan qiymat",
  'Значение не подходит ни под один допустимый формат': "Qiymat hech bir ruxsat etilgan formatga mos kelmaydi",
  'Некорректная дата': "Noto'g'ri sana",
  'Некорректный адрес почты': "Noto'g'ri elektron pochta",
  'Некорректная ссылка': "Noto'g'ri havola",
  'Некорректный идентификатор': "Noto'g'ri identifikator",
  'Некорректные дата и время': "Noto'g'ri sana va vaqt",
  'Значение не соответствует формату': 'Qiymat formatga mos kelmaydi',
  'Добавьте хотя бы одно значение': "Kamida bitta qiymat qo'shing",
  'Дата слишком ранняя': 'Sana juda erta',
  'Дата слишком поздняя': 'Sana juda kech',
  'Значение должно быть конечным числом': "Qiymat chekli son bo'lishi kerak",

  // middleware
  'Требуется вход в систему': 'Tizimga kirish talab qilinadi',
  'Учётная запись деактивирована. Обратитесь к руководству': "Hisob o'chirilgan. Rahbariyatga murojaat qiling",

  // archive
  'В архиве только выполненные и отменённые заказы': 'Arxivda faqat bajarilgan va bekor qilingan buyurtmalar',

  // auth
  'Введите пароль': 'Parolni kiriting',
  'Введите текущий пароль': 'Joriy parolni kiriting',
  'Неверный номер телефона или пароль': "Telefon raqami yoki parol noto'g'ri",
  'Вы и так вошли под собой': "Siz allaqachon o'zingiz sifatida kirgansiz",
  'Учётная запись деактивирована — войти под ней нельзя': "Hisob o'chirilgan — u bilan kirib bo'lmaydi",
  'Сессия истекла, войдите заново': 'Sessiya tugadi, qayta kiring',
  'Сессия недействительна. Все устройства отключены, войдите заново': "Sessiya yaroqsiz. Barcha qurilmalar o'chirildi, qayta kiring",
  'Текущий пароль указан неверно': "Joriy parol noto'g'ri",
  'Новый пароль совпадает с текущим': 'Yangi parol joriy parol bilan bir xil',

  // branches
  'Филиал не найден': 'Filial topilmadi',
  'Укажите название филиала': "Filial nomini ko'rsating",

  // catalog
  'Укажите название': "Nomini ko'rsating",
  'Позиция справочника не найдена': "Ma'lumotnoma pozitsiyasi topilmadi",
  'Укажите код': "Kodni ko'rsating",

  // dayOff
  'Не удалось создать запрос': "So'rov yaratib bo'lmadi",
  'Запрос не найден': "So'rov topilmadi",
  'Запрос уже рассмотрен': "So'rov allaqachon ko'rib chiqilgan",
  'Сотрудник не найден': 'Xodim topilmadi',
  'Сотрудник не работает — выходной ему не нужен': "Xodim ishlamaydi — unga dam olish kuni kerak emas",
  'Не удалось назначить выходной': "Dam olish kunini tayinlab bo'lmadi",
  'Запись не найдена': 'Yozuv topilmadi',
  'Снять можно только согласованный выходной': "Faqat kelishilgan dam olish kunini olib tashlash mumkin",
  'Это не ваш запрос': "Bu sizning so'rovingiz emas",

  // notifications
  'Уведомление не найдено': 'Bildirishnoma topilmadi',

  // orderComments
  'Заказ не найден': 'Buyurtma topilmadi',
  'Введите текст комментария': 'Izoh matnini kiriting',
  'Не удалось сохранить комментарий': "Izohni saqlab bo'lmadi",
  'Не удалось сохранить голосовой комментарий': "Ovozli izohni saqlab bo'lmadi",
  'Комментарий не найден': 'Izoh topilmadi',
  'Удалить комментарий может его автор или руководство': "Izohni faqat muallifi yoki rahbariyat o'chira oladi",

  // orderPhotos
  'Не удалось сохранить фото': "Suratni saqlab bo'lmadi",
  'Фото не найдено': 'Surat topilmadi',
  'Удалить фото может тот, кто его загрузил, или руководство': "Suratni faqat yuklagan kishi yoki rahbariyat o'chira oladi",

  // orders
  'Укажите обе стороны или оставьте размеры пустыми': "Ikkala tomonni ko'rsating yoki o'lchamlarni bo'sh qoldiring",
  'Укажите имя клиента': "Mijoz ismini ko'rsating",
  'Добавьте хотя бы одну позицию': "Kamida bitta pozitsiya qo'shing",
  'Укажите филиал: у вас не задан основной филиал': "Filialni ko'rsating: sizda asosiy filial belgilanmagan",
  'Нельзя создать заказ в филиале, к которому вы не привязаны': "Siz biriktirilmagan filialda buyurtma yaratib bo'lmaydi",
  'Не удалось создать заказ': "Buyurtma yaratib bo'lmadi",
  'Слишком много позиций в одной продаже': "Bitta sotuvda juda ko'p pozitsiya",
  'Укажите адрес установки': "O'rnatish manzilini ko'rsating",
  'Готовая штора не найдена': 'Tayyor parda topilmadi',
  'Править заказ может его автор или руководство': "Buyurtmani faqat muallifi yoki rahbariyat tahrirlay oladi",
  'Заказ уже в работе — правки вносит администратор': "Buyurtma allaqachon ishda — tahrirni administrator kiritadi",
  'Позиция заказа не найдена': 'Buyurtma pozitsiyasi topilmadi',
  'Не удалось изменить статус заказа': "Buyurtma holatini o'zgartirib bo'lmadi",
  'В сборочном листе нет такой строки': "Yig'ish varag'ida bunday qator yo'q",
  'Карниз ставит карнизчик': "Karnizni karnizchi o'rnatadi",
  'В этом заказе карниза нет': "Bu buyurtmada karniz yo'q",
  'Карниз уже взят в работу': 'Karniz allaqachon ishga olingan',
  'Карниз уже отмечен готовым': 'Karniz allaqachon tayyor deb belgilangan',
  'Сначала возьмите карниз в работу': 'Avval karnizni ishga oling',
  'Этот карниз взял другой сотрудник': 'Bu karnizni boshqa xodim olgan',
  'Загрузите фото карниза — без снимка работа не принимается': "Karniz suratini yuklang — suratsiz ish qabul qilinmaydi",

  // payroll
  'Не удалось сохранить схему начисления': "Hisoblash sxemasini saqlab bo'lmadi",
  'Ошибка расчёта': 'Hisoblash xatosi',
  'Начисление не найдено': 'Hisoblash topilmadi',
  'Это чужое начисление': 'Bu boshqa xodimning hisoblashi',
  'Расчёт не найден': 'Hisob topilmadi',
  'Не удалось утвердить расчёт': "Hisobni tasdiqlab bo'lmadi",
  'Сначала утвердите расчёт': 'Avval hisobni tasdiqlang',
  'Расчёт уже выплачен': "Hisob allaqachon to'langan",
  'Это расчёт другого сотрудника': 'Bu boshqa xodimning hisobi',
  'Расчёт ещё не выплачен — подтверждать нечего': "Hisob hali to'lanmagan — tasdiqlash uchun narsa yo'q",
  'Получение уже подтверждено': 'Olinganligi allaqachon tasdiqlangan',
  'План KPI должен быть больше нуля': "KPI rejasi noldan katta bo'lishi kerak",

  // personalWorks
  'Личная работа не найдена': 'Shaxsiy ish topilmadi',
  'Это личная работа другого сотрудника': 'Bu boshqa xodimning shaxsiy ishi',
  'Личная работа уже закрыта': 'Shaxsiy ish allaqachon yopilgan',
  'Опишите, что шьёте': 'Nima tikayotganingizni yozing',
  'Личная работа не создана': 'Shaxsiy ish yaratilmadi',

  // purchases
  'Укажите название товара': "Tovar nomini ko'rsating",
  'Товар не найден': 'Tovar topilmadi',
  'Количество должно быть больше нуля': "Miqdor noldan katta bo'lishi kerak",
  'Нельзя проводить закупку по отменённому заказу': "Bekor qilingan buyurtma bo'yicha xarid o'tkazib bo'lmaydi",
  'Товар не найден в каталоге': 'Tovar katalogda topilmadi',
  'Не удалось провести закупку': "Xaridni o'tkazib bo'lmadi",
  'Закупка не найдена': 'Xarid topilmadi',

  // readyMade
  'Нельзя вести склад филиала, к которому вы не привязаны': "Siz biriktirilmagan filial omborini yuritib bo'lmaydi",
  'Укажите модель': "Modelni ko'rsating",
  'Не удалось сохранить готовую штору': "Tayyor pardani saqlab bo'lmadi",

  // retail
  'Слишком большое количество': 'Miqdor juda katta',
  'Товар не создан': 'Tovar yaratilmadi',
  'Количество не может быть нулевым': "Miqdor nol bo'lishi mumkin emas",
  'Добавьте хотя бы один товар': "Kamida bitta tovar qo'shing",
  'Нельзя продавать в филиале, к которому вы не привязаны': "Siz biriktirilmagan filialda sotib bo'lmaydi",
  'Товар не найден в прайсе': "Tovar narxlar ro'yxatida topilmadi",
  'Чек не создан': 'Chek yaratilmadi',
  'Чек не найден': 'Chek topilmadi',
  'Это чек другого продавца': 'Bu boshqa sotuvchining cheki',

  // shifts
  'Смена уже открыта. Сначала завершите текущую смену': 'Smena allaqachon ochiq. Avval joriy smenani tugating',
  'Не удалось открыть смену': "Smenani ochib bo'lmadi",
  'Открытая смена не найдена': 'Ochiq smena topilmadi',
  'Не удалось закрыть смену': "Smenani yopib bo'lmadi",
  'Сначала откройте смену — отлучаться не от чего': "Avval smenani oching — tanaffusga chiqadigan narsa yo'q",
  'Отлучка уже начата': 'Tanaffus allaqachon boshlangan',
  'Вы на установке — сначала отметьте возвращение': "Siz o'rnatishdasiz — avval qaytganingizni belgilang",
  'Не удалось начать отлучку': "Tanaffusni boshlab bo'lmadi",
  'Открытая отлучка не найдена': 'Ochiq tanaffus topilmadi',
  'Сначала откройте смену — выезжать не с чего': "Avval smenani oching — chiqadigan narsa yo'q",
  'Вы уже отмечены на установке': "Siz allaqachon o'rnatishda belgilangansiz",
  'Вы на личной отлучке — сначала отметьте возвращение': 'Siz shaxsiy tanaffusdasiz — avval qaytganingizni belgilang',
  'Не удалось отметить выезд': "Chiqishni belgilab bo'lmadi",
  'Открытый выезд не найден': 'Ochiq chiqish topilmadi',
  'Время окончания должно быть позже начала': "Tugash vaqti boshlanishdan keyin bo'lishi kerak",
  'Нельзя завести смену будущим числом': "Kelajakdagi sana bilan smena yaratib bo'lmaydi",
  'Смена не найдена': 'Smena topilmadi',
  'Не удалось сохранить смену': "Smenani saqlab bo'lmadi",

  // smm
  'Функционал роли SMM ещё не определён': 'SMM roli vazifalari hali belgilanmagan',

  // tasks
  'Опишите поручение': "Topshiriqni ta'riflang",
  'Сотрудник уволен — поручение выдать некому': "Xodim ishdan bo'shatilgan — topshiriq beradigan odam yo'q",
  'Доп. работа не создана': "Qo'shimcha ish yaratilmadi",
  'Поручение не найдено': 'Topshiriq topilmadi',
  'Напишите сообщение или приложите файл': "Xabar yozing yoki fayl biriktiring",
  'Не удалось сохранить сообщение': "Xabarni saqlab bo'lmadi",
  'Доп. работа не найдена': "Qo'shimcha ish topilmadi",
  'Доп. работа закреплена за другим сотрудником': "Qo'shimcha ish boshqa xodimga biriktirilgan",
  'Доп. работа уже закрыта': "Qo'shimcha ish allaqachon yopilgan",
  'Это поручение выдано другому сотруднику': 'Bu topshiriq boshqa xodimga berilgan',

  // users
  'Это последний активный директор. Сначала назначьте другого': "Bu oxirgi faol direktor. Avval boshqasini tayinlang",
  'Профиль другого сотрудника доступен только руководству': "Boshqa xodim profili faqat rahbariyatga ochiq",
  'Укажите ФИО сотрудника': "Xodimning to'liq ismini ko'rsating",
  'Назначьте хотя бы одну роль': 'Kamida bitta rol tayinlang',
  'Привяжите сотрудника хотя бы к одному филиалу': 'Xodimni kamida bitta filialga biriktiring',
  'Основной филиал должен быть среди привязанных': "Asosiy filial biriktirilganlar orasida bo'lishi kerak",
  'Сотрудник с таким номером телефона уже заведён': 'Bunday telefon raqamli xodim allaqachon mavjud',
  'Нельзя деактивировать собственную учётную запись': "O'z hisobingizni o'chirib bo'lmaydi",
  'Нельзя снять последнюю роль. Назначьте другую роль или деактивируйте сотрудника': "Oxirgi rolni olib bo'lmaydi. Boshqa rol tayinlang yoki xodimni o'chiring",
  'Нужен хотя бы один филиал': 'Kamida bitta filial kerak',

  // geolocation
  'Координаты получены некорректно. Проверьте, включена ли геолокация': "Koordinatalar noto'g'ri olindi. Geolokatsiya yoqilganini tekshiring",
  'Вы не привязаны ни к одному активному филиалу. Обратитесь к администратору': "Siz hech bir faol filialga biriktirilmagansiz. Administratorga murojaat qiling",
  'Не удалось определить ближайший филиал': "Eng yaqin filialni aniqlab bo'lmadi",

  // orderWorkflow
  'Заказ недоступен: вы не участвуете в его выполнении': 'Buyurtma mavjud emas: siz uning bajarilishida ishtirok etmaysiz',
  'Назначать исполнителей вправе только администратор или директор': 'Ijrochilarni faqat administrator yoki direktor tayinlay oladi',
  'Не удалось обновить заказ': "Buyurtmani yangilab bo'lmadi",
  'Нельзя назначить деактивированного сотрудника': "O'chirilgan xodimni tayinlab bo'lmaydi",

  // packList
  'Отмечать сборку может тот, кто едет на установку': "Yig'ishni faqat o'rnatishga boradigan kishi belgilay oladi",

  // storage
  'Некорректный ключ файла в хранилище': "Xotirada fayl kaliti noto'g'ri",
  'Файл пуст или повреждён': "Fayl bo'sh yoki buzilgan",
};

/* -------------------------------------------------------------------------- */
/*  Шаблоны с подстановками                                                    */
/* -------------------------------------------------------------------------- */

/** `{имя}` в русском шаблоне захватывает кусок текста и подставляется в узбекский. */
const PATTERNS: readonly (readonly [ru: string, uz: string])[] = [
  // zodMessages.ts
  ['Ожидается {type}', '{type} kutilmoqda'],
  ['Лишние поля: {keys}', 'Ortiqcha maydonlar: {keys}'],
  ['Ровно {n} {unit}', 'Aniq {n} ta belgi'],
  ['Не короче {n} {unit}', 'Kamida {n} ta belgi'],
  ['Не меньше {n} {unit}', 'Kamida {n} ta element'],
  ['Не длиннее {n} {unit}', "Ko'pi bilan {n} ta belgi"],
  ['Не больше {n} {unit}', "Ko'pi bilan {n} ta element"],
  ['Значение не меньше {n}', 'Qiymat kamida {n}'],
  ['Значение больше {n}', 'Qiymat {n} dan katta'],
  ['Значение не больше {n}', "Qiymat ko'pi bilan {n}"],
  ['Значение меньше {n}', 'Qiymat {n} dan kichik'],
  ['Значение должно быть кратно {n}', "Qiymat {n} ga karrali bo'lishi kerak"],

  // lib/schemas.ts
  ['Пароль должен быть не короче {n} символов', "Parol kamida {n} ta belgidan iborat bo'lishi kerak"],
  ['Пароль должен быть не длиннее {n} символов', "Parol ko'pi bilan {n} ta belgidan iborat bo'lishi kerak"],

  // middleware / services
  ['Недостаточно прав. Действие доступно ролям: {roles}', 'Huquq yetarli emas. Amal quyidagi rollarga ochiq: {roles}'],
  ['Радиус не может быть меньше {n} м', "Radius {n} m dan kichik bo'lishi mumkin emas"],
  ['Радиус не может быть больше {n} м', "Radius {n} m dan katta bo'lishi mumkin emas"],
  ['Филиал с названием «{name}» уже существует', '«{name}» nomli filial allaqachon mavjud'],
  ['Позиция «{name}» уже есть в этом справочнике', "«{name}» pozitsiyasi bu ma'lumotnomada allaqachon bor"],
  ['Период не может превышать {n} дней, а конец — быть раньше начала', "Davr {n} kundan oshmasligi, tugashi esa boshlanishidan oldin bo'lmasligi kerak"],
  ['Голосовое сообщение не длиннее {n} секунд', "Ovozli xabar ko'pi bilan {n} soniya"],
  ['Фото стадии «{stage}» загружает другой исполнитель', '«{stage}» bosqichi suratini boshqa ijrochi yuklaydi'],
  ['«{model}» лежит в другом филиале', '«{model}» boshqa filialda turibdi'],
  ['«{model}»: на складе {have} шт, продать {want} нельзя', "«{model}»: omborda {have} dona, {want} dona sotib bo'lmaydi"],
  ['Для схемы «{type}» это поле обязательно', "«{type}» sxemasi uchun bu maydon majburiy"],
  ['У сотрудника нет роли «{role}» — условия по ней не нужны', "Xodimda «{role}» roli yo'q — u bo'yicha shartlar kerak emas"],
  ['Нельзя утвердить расчёт в статусе «{status}»', "«{status}» holatidagi hisobni tasdiqlab bo'lmaydi"],
  ['Товар «{name}» уже есть в каталоге', '«{name}» tovari katalogda allaqachon bor'],
  ['Товар «{name}» выведен из обращения. Укажите цену вручную или выберите другой', "«{name}» tovari muomaladan chiqarilgan. Narxni qo'lda kiriting yoki boshqasini tanlang"],
  ['«{name}»: на витрине {have}, списать {want} нельзя.', "«{name}»: vitrinada {have}, {want} ni hisobdan chiqarib bo'lmaydi."],
  ['«{name}» снят с продажи', '«{name}» sotuvdan olingan'],
  ['«{name}»: на витрине осталось {have}, а продаётся {want}. Оприходуйте поступление.', "«{name}»: vitrinada {have} qoldi, {want} sotilmoqda. Kirimni rasmiylashtiring."],
  ['У сотрудника нет роли «{role}»', "Xodimda «{role}» roli yo'q"],
  ['Вы находитесь в {distance} от филиала «{branch}». Отметиться можно в пределах {radius} м', "Siz «{branch}» filialidan {distance} masofadasiz. Belgilash {radius} m radiusda mumkin"],
  ['Слишком много неудачных попыток входа. Повторите через {n} мин. или обратитесь к руководству', "Muvaffaqiyatsiz kirish urinishlari juda ko'p. {n} daqiqadan keyin qayta urinib ko'ring yoki rahbariyatga murojaat qiling"],
  ['Заказ уже находится в статусе «{status}»', 'Buyurtma allaqachon «{status}» holatida'],
  ['Из статуса «{from}» нельзя перейти в «{to}». Доступные переходы: {allowed}', "«{from}» holatidan «{to}» holatiga o'tib bo'lmaydi. Mumkin bo'lgan o'tishlar: {allowed}"],
  ['Из статуса «{from}» нельзя перейти в «{to}». Заказ закрыт', "«{from}» holatidan «{to}» holatiga o'tib bo'lmaydi. Buyurtma yopilgan"],
  ['Действие «{action}» доступно ролям: {roles}', '«{action}» amali quyidagi rollarga ochiq: {roles}'],
  ['Укажите причину: действие «{action}» требует комментария', "Sababni ko'rsating: «{action}» amali izoh talab qiladi"],
  ['Статус «{status}» не требует исполнителя — назначьте его отдельно', "«{status}» holati ijrochi talab qilmaydi — uni alohida tayinlang"],
  ['Сначала назначьте исполнителя с ролью «{role}»', 'Avval «{role}» rolli ijrochini tayinlang'],
  ['Заказ {order} закреплён за другим сотрудником', '{order} buyurtmasi boshqa xodimga biriktirilgan'],
  ['Сначала соберитесь на выезд. Не отмечено: {items} и ещё {n}', "Avval chiqishga yig'iling. Belgilanmagan: {items} va yana {n}"],
  ['Сначала соберитесь на выезд. Не отмечено: {items}', "Avval chiqishga yig'iling. Belgilanmagan: {items}"],
  ['Схема «{type}» настроена некорректно: не заполнено поле «{field}»', "«{type}» sxemasi noto'g'ri sozlangan: «{field}» maydoni to'ldirilmagan"],
  ['Сотруднику не заданы условия оплаты в роли «{role}»', "Xodimga «{role}» rolida to'lov shartlari belgilanmagan"],
  ['Формат «{mime}» не поддерживается. Допустимо: {allowed}', "«{mime}» formati qo'llab-quvvatlanmaydi. Ruxsat etilgan: {allowed}"],
  ['Файл больше {n} МБ', 'Fayl {n} MB dan katta'],
];

/* -------------------------------------------------------------------------- */
/*  Подписи справочников внутри сообщений                                     */
/* -------------------------------------------------------------------------- */

/**
 * Русская подпись справочника → узбекская. Статусы, роли и стадии попадают в
 * текст ошибки уже по-русски (`ROLE_LABELS_RU[role]`), и без обратного
 * словаря узбекская фраза получила бы русское слово посередине.
 */
const LABEL_RU_TO_UZ: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  const add = <TKey extends string>(dict: Translated<TKey>): void => {
    for (const key of Object.keys(dict.ru) as TKey[]) map.set(dict.ru[key], dict.uz[key]);
  };
  add(ORDER_STATUS_LABELS);
  add(ROLE_LABELS);
  add(PHOTO_STAGE_LABELS);
  add(CORNICE_STATUS_LABELS);
  add(PAYROLL_RECORD_STATUS_LABELS);
  add(PAYROLL_SCHEME_TYPE_LABELS);
  // Подписи кнопок переходов («Отдать на пошив») — в тексте про права.
  for (const transition of ORDER_TRANSITIONS) {
    map.set(transition.label, transitionLabel(transition, 'uz'));
  }
  return map;
})();

/** Захваченный кусок: подпись справочника или список подписей через запятую. */
function translateFragment(value: string): string {
  const direct = LABEL_RU_TO_UZ.get(value);
  if (direct !== undefined) return direct;
  if (value.includes(', ')) {
    return value
      .split(', ')
      .map((part) => LABEL_RU_TO_UZ.get(part) ?? part)
      .join(', ');
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/*  Перевод                                                                   */
/* -------------------------------------------------------------------------- */

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED: readonly { readonly rx: RegExp; readonly uz: string; readonly names: readonly string[] }[] =
  PATTERNS.map(([ru, uz]) => {
    const names: string[] = [];
    const source = ru
      .split(/(\{\w+\})/)
      .map((chunk) => {
        const match = /^\{(\w+)\}$/.exec(chunk);
        if (match?.[1] === undefined) return escapeRegExp(chunk);
        names.push(match[1]);
        return '([\\s\\S]+?)';
      })
      .join('');
    return { rx: new RegExp(`^${source}$`), uz, names };
  });

/**
 * Сообщение об ошибке на языке клиента.
 *
 * Русский — исходный язык, возвращается как есть. Для узбекского ищется
 * точное соответствие, затем шаблон; текст без перевода уходит по-русски —
 * это лучше пустой строки, а тест не даст такому тексту появиться незаметно.
 */
export function translateErrorMessage(message: string, locale: Locale): string {
  if (locale === 'ru') return message;

  const exact = EXACT[message];
  if (exact !== undefined) return exact;

  for (const { rx, uz, names } of COMPILED) {
    const match = rx.exec(message);
    if (match === null) continue;
    return names.reduce(
      (text, name, index) =>
        text.replaceAll(`{${name}}`, translateFragment(match[index + 1] ?? '')),
      uz,
    );
  }

  return message;
}

/** Для теста покрытия: все известные русские тексты. */
export const KNOWN_ERROR_MESSAGES = {
  exact: Object.keys(EXACT),
  patterns: PATTERNS.map(([ru]) => ru),
} as const;
