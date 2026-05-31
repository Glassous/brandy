import { useState, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Avatar } from '../components/shared/Avatar';
import { AvatarCropper } from '../components/shared/AvatarCropper';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config';

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const ProfileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const SecurityIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const AppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ArrowBackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

export function AccountSettingsPage() {
  const { user, token, updateProfile, logout, uploadAvatar, deleteAllLocalChatHistories } = useApp();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'app'>('profile');

  // Profile fields
  const [nick, setNick] = useState(user?.nickname || '');
  const [customPath, setCustomPath] = useState(user?.custom_transfer_path || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [genderType, setGenderType] = useState<'male' | 'female' | 'other' | 'unspecified'>(() => {
    const g = user?.gender || '';
    if (g === 'male' || g === 'female' || g === 'unspecified') return g as any;
    if (g.startsWith('other:')) return 'other';
    return 'unspecified';
  });
  const [customGender, setCustomGender] = useState(() => {
    const g = user?.gender || '';
    if (g.startsWith('other:')) return g.substring(6);
    return '';
  });
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [country, setCountry] = useState(user?.country || '');
  const [city, setCity] = useState(user?.city || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [job, setJob] = useState(user?.job || '');
  const [saving, setSaving] = useState(false);

  // Password fields
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdChanging, setPwdChanging] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Per-field password visibility
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const countries = [
    { code: '', name: '🏳️ 未选择', search: '未选择 no selection' },
    // Asia
    { code: 'CN', name: '🇨🇳 中国 (China)', search: '中国 china cn' },
    { code: 'HK', name: '🇭🇰 香港 (Hong Kong)', search: '香港 hong kong hk' },
    { code: 'MO', name: '🇲🇴 澳门 (Macau)', search: '澳门 macau mo' },
    { code: 'TW', name: '🇹🇼 台湾 (Taiwan)', search: '台湾 taiwan tw' },
    { code: 'JP', name: '🇯🇵 日本 (Japan)', search: '日本 japan jp' },
    { code: 'KR', name: '🇰🇷 韩国 (South Korea)', search: '韩国 south korea kr' },
    { code: 'SG', name: '🇸🇬 新加坡 (Singapore)', search: '新加坡 singapore sg' },
    { code: 'MY', name: '🇲🇾 马来西亚 (Malaysia)', search: '马来西亚 malaysia my' },
    { code: 'TH', name: '🇹🇭 泰国 (Thailand)', search: '泰国 thailand th' },
    { code: 'VN', name: '🇻🇳 越南 (Vietnam)', search: '越南 vietnam vn' },
    { code: 'PH', name: '🇵🇭 菲律宾 (Philippines)', search: '菲律宾 philippines ph' },
    { code: 'ID', name: '🇮🇩 印度尼西亚 (Indonesia)', search: '印度尼西亚 indonesia id' },
    { code: 'IN', name: '🇮🇳 印度 (India)', search: '印度 india in' },
    { code: 'PK', name: '🇵🇰 巴基斯坦 (Pakistan)', search: '巴基斯坦 pakistan pk' },
    { code: 'BD', name: '🇧🇩 孟加拉国 (Bangladesh)', search: '孟加拉国 bangladesh bd' },
    { code: 'LK', name: '🇱🇰 斯里兰卡 (Sri Lanka)', search: '斯里兰卡 sri lanka lk' },
    { code: 'NP', name: '🇳🇵 尼泊尔 (Nepal)', search: '尼泊尔 nepal np' },
    { code: 'MM', name: '🇲🇲 缅甸 (Myanmar)', search: '缅甸 myanmar mm' },
    { code: 'KH', name: '🇰🇭 柬埔寨 (Cambodia)', search: '柬埔寨 cambodia kh' },
    { code: 'LA', name: '🇱🇦 老挝 (Laos)', search: '老挝 laos la' },
    { code: 'MN', name: '🇲🇳 蒙古 (Mongolia)', search: '蒙古 mongolia mn' },
    { code: 'KP', name: '🇰🇵 朝鲜 (North Korea)', search: '朝鲜 north korea kp' },
    { code: 'KZ', name: '🇰🇿 哈萨克斯坦 (Kazakhstan)', search: '哈萨克斯坦 kazakhstan kz' },
    { code: 'UZ', name: '🇺🇿 乌兹别克斯坦 (Uzbekistan)', search: '乌兹别克斯坦 uzbekistan uz' },
    { code: 'KG', name: '🇰🇬 吉尔吉斯斯坦 (Kyrgyzstan)', search: '吉尔吉斯斯坦 kyrgyzstan kg' },
    { code: 'TJ', name: '🇹🇯 塔吉克斯坦 (Tajikistan)', search: '塔吉克斯坦 tajikistan tj' },
    { code: 'TM', name: '🇹🇲 土库曼斯坦 (Turkmenistan)', search: '土库曼斯坦 turkmenistan tm' },
    { code: 'AF', name: '🇦🇫 阿富汗 (Afghanistan)', search: '阿富汗 afghanistan af' },
    { code: 'IR', name: '🇮🇷 伊朗 (Iran)', search: '伊朗 iran ir' },
    { code: 'IQ', name: '🇮🇶 伊拉克 (Iraq)', search: '伊拉克 iraq iq' },
    { code: 'SY', name: '🇸🇾 叙利亚 (Syria)', search: '叙利亚 syria sy' },
    { code: 'JO', name: '🇯🇴 约旦 (Jordan)', search: '约旦 jordan jo' },
    { code: 'LB', name: '🇱🇧 黎巴嫩 (Lebanon)', search: '黎巴嫩 lebanon lb' },
    { code: 'IL', name: '🇮🇱 以色列 (Israel)', search: '以色列 israel il' },
    { code: 'PS', name: '🇵🇸 巴勒斯坦 (Palestine)', search: '巴勒斯坦 palestine ps' },
    { code: 'SA', name: '🇸🇦 沙特阿拉伯 (Saudi Arabia)', search: '沙特阿拉伯 saudi arabia sa' },
    { code: 'AE', name: '🇦🇪 阿联酋 (United Arab Emirates)', search: '阿联酋 united arab emirates ae' },
    { code: 'QA', name: '🇶🇦 卡塔尔 (Qatar)', search: '卡塔尔 qatar qa' },
    { code: 'KW', name: '🇰🇼 科威特 (Kuwait)', search: '科威特 kuwait kw' },
    { code: 'OM', name: '🇴🇲 阿曼 (Oman)', search: '阿曼 oman om' },
    { code: 'YE', name: '🇾🇪 也门 (Yemen)', search: '也门 yemen ye' },
    { code: 'BH', name: '🇧🇭 巴林 (Bahrain)', search: '巴林 bahrain bh' },
    { code: 'GE', name: '🇬🇪 格鲁吉亚 (Georgia)', search: '格鲁吉亚 georgia ge' },
    { code: 'AM', name: '🇦🇲 亚美尼亚 (Armenia)', search: '亚美尼亚 armenia am' },
    { code: 'AZ', name: '🇦🇿 阿塞拜疆 (Azerbaijan)', search: '阿塞拜疆 azerbaijan az' },
    { code: 'TR', name: '🇹🇷 土耳其 (Turkey)', search: '土耳其 turkey tr' },
    { code: 'TL', name: '🇹🇱 东帝汶 (East Timor)', search: '东帝汶 east timor tl' },
    { code: 'MV', name: '🇲🇻 马尔代夫 (Maldives)', search: '马尔代夫 maldives mv' },
    { code: 'BN', name: '🇧🇳 文莱 (Brunei)', search: '文莱 brunei bn' },
    { code: 'BT', name: '🇧🇹 不丹 (Bhutan)', search: '不丹 bhutan bt' },

    // Europe
    { code: 'US', name: '🇺🇸 美国 (United States)', search: '美国 united states us usa' },
    { code: 'GB', name: '🇬🇧 英国 (United Kingdom)', search: '英国 united kingdom gb uk' },
    { code: 'CA', name: '🇨🇦 加拿大 (Canada)', search: '加拿大 canada ca' },
    { code: 'AU', name: '🇦🇺 澳大利亚 (Australia)', search: '澳大利亚 australia au' },
    { code: 'NZ', name: '🇳🇿 新西兰 (New Zealand)', search: '新西兰 new zealand nz' },
    { code: 'DE', name: '🇩🇪 德国 (Germany)', search: '德国 germany de' },
    { code: 'FR', name: '🇫🇷 法国 (France)', search: '法国 france fr' },
    { code: 'RU', name: '🇷🇺 俄罗斯 (Russia)', search: '俄罗斯 russia ru' },
    { code: 'IT', name: '🇮🇹 意大利 (Italy)', search: '意大利 italy it' },
    { code: 'ES', name: '🇪🇸 西班牙 (Spain)', search: '西班牙 spain es' },
    { code: 'NL', name: '🇳🇱 荷兰 (Netherlands)', search: '荷兰 netherlands nl' },
    { code: 'CH', name: '🇨🇭 瑞士 (Switzerland)', search: '瑞士 switzerland ch' },
    { code: 'SE', name: '🇸🇪 瑞典 (Sweden)', search: '瑞典 sweden se' },
    { code: 'NO', name: '🇳🇴 挪威 (Norway)', search: '挪威 norway no' },
    { code: 'DK', name: '🇩🇰 丹麦 (Denmark)', search: '丹麦 denmark dk' },
    { code: 'FI', name: '🇫🇮 芬兰 (Finland)', search: '芬兰 finland fi' },
    { code: 'IE', name: '🇮🇪 爱尔兰 (Ireland)', search: '爱尔兰 ireland ie' },
    { code: 'BE', name: '🇧🇪 比利时 (Belgium)', search: '比利时 belgium be' },
    { code: 'AT', name: '🇦🇹 奥地利 (Austria)', search: '奥地利 austria at' },
    { code: 'PL', name: '🇵🇱 波兰 (Poland)', search: '波兰 poland pl' },
    { code: 'UA', name: '🇺🇦 乌克兰 (Ukraine)', search: '乌克兰 ukraine ua' },
    { code: 'GR', name: '🇬🇷 希腊 (Greece)', search: '希腊 greece gr' },
    { code: 'PT', name: '🇵🇹 葡萄牙 (Portugal)', search: '葡萄牙 portugal pt' },
    { code: 'RO', name: '🇷🇴 罗马尼亚 (Romania)', search: '罗马尼亚 romania ro' },
    { code: 'CZ', name: '🇨🇿 捷克 (Czech Republic)', search: '捷克 czech republic cz' },
    { code: 'HU', name: '🇭🇺 匈牙利 (Hungary)', search: '匈牙利 hungary hu' },
    { code: 'IS', name: '🇮🇸 冰岛 (Iceland)', search: '冰岛 iceland is' },
    { code: 'LU', name: '🇱🇺 卢森堡 (Luxembourg)', search: '卢森堡 luxembourg lu' },
    { code: 'MC', name: '🇲🇨 摩纳哥 (Monaco)', search: '摩纳哥 monaco mc' },
    { code: 'LI', name: '🇱🇮 列支敦士登 (Liechtenstein)', search: '列支敦士登 liechtenstein li' },
    { code: 'AD', name: '🇦🇩 安道尔 (Andorra)', search: '安道尔 andorra ad' },
    { code: 'SM', name: '🇸🇲 圣马力诺 (San Marino)', search: '圣马力诺 san marino sm' },
    { code: 'VA', name: '🇻🇦 梵蒂冈 (Vatican City)', search: '梵蒂冈 vatican city va' },
    { code: 'EE', name: '🇪🇪 爱沙尼亚 (Estonia)', search: '爱沙尼亚 estonia ee' },
    { code: 'LV', name: '🇱🇻 拉脱维亚 (Latvia)', search: '拉脱维亚 latvia lv' },
    { code: 'LT', name: '🇱🇹 立陶宛 (Lithuania)', search: '立陶宛 lithuania lt' },
    { code: 'BY', name: '🇧🇾 白俄罗斯 (Belarus)', search: '白俄罗斯 belarus by' },
    { code: 'MD', name: '🇲🇩 摩尔多瓦 (Moldova)', search: '摩尔多瓦 moldova md' },
    { code: 'SK', name: '🇸🇰 斯洛伐克 (Slovakia)', search: '斯洛伐克 slovakia sk' },
    { code: 'SI', name: '🇸🇮 斯洛文尼亚 (Slovenia)', search: '斯洛文尼亚 slovenia si' },
    { code: 'HR', name: '🇭🇷 克罗地亚 (Croatia)', search: '克罗地亚 croatia hr' },
    { code: 'BA', name: '🇧🇦 波黑 (Bosnia and Herzegovina)', search: '波黑 bosnia and herzegovina ba' },
    { code: 'RS', name: '🇷🇸 塞尔维亚 (Serbia)', search: '塞尔维亚 serbia rs' },
    { code: 'ME', name: '🇲🇪 黑山 (Montenegro)', search: '黑山 montenegro me' },
    { code: 'MK', name: '🇲🇰 北马其顿 (North Macedonia)', search: '北马其顿 north macedonia mk' },
    { code: 'AL', name: '🇦🇱 阿尔巴尼亚 (Albania)', search: '阿尔巴尼亚 albania al' },
    { code: 'BG', name: '🇧🇬 保加利亚 (Bulgaria)', search: '保加利亚 bulgaria bg' },
    { code: 'MT', name: '🇲🇹 马耳他 (Malta)', search: '马耳他 malta mt' },
    { code: 'CY', name: '🇨🇾 塞浦路斯 (Cyprus)', search: '塞浦路斯 cyprus cy' },

    // Americas
    { code: 'MX', name: '🇲🇽 墨西哥 (Mexico)', search: '墨西哥 mexico mx' },
    { code: 'GT', name: '🇬🇹 危地马拉 (Guatemala)', search: '危地马拉 guatemala gt' },
    { code: 'BZ', name: '🇧🇿 伯利兹 (Belize)', search: '伯利兹 belize bz' },
    { code: 'SV', name: '🇸🇻 萨尔瓦多 (El Salvador)', search: '萨尔瓦多 el salvador sv' },
    { code: 'HN', name: '🇭🇳 洪都拉斯 (Honduras)', search: '洪都拉斯 honduras hn' },
    { code: 'NI', name: '🇳🇮 尼加拉瓜 (Nicaragua)', search: '尼加拉瓜 nicaragua ni' },
    { code: 'CR', name: '🇨🇷 哥斯达黎加 (Costa Rica)', search: '哥斯达黎加 costa rica cr' },
    { code: 'PA', name: '🇵🇦 巴拿马 (Panama)', search: '巴拿马 panama pa' },
    { code: 'CU', name: '🇨🇺 古巴 (Cuba)', search: '古巴 cuba cu' },
    { code: 'JM', name: '🇯🇲 牙买加 (Jamaica)', search: '牙买加 jamaica jm' },
    { code: 'HT', name: '🇭🇹 海地 (Haiti)', search: '海地 haiti ht' },
    { code: 'DO', name: '🇩🇴 多米尼加 (Dominican Republic)', search: '多米尼加 dominican republic do' },
    { code: 'BS', name: '🇧🇸 巴哈马 (Bahamas)', search: '巴哈马 bahamas bs' },
    { code: 'BB', name: '🇧🇧 巴巴多斯 (Barbados)', search: '巴巴多斯 barbados bb' },
    { code: 'TT', name: '🇹🇹 特立尼达和多巴哥 (Trinidad and Tobago)', search: '特立尼达和多巴哥 trinidad and tobago tt' },
    { code: 'CO', name: '🇨🇴 哥乐比亚 (Colombia)', search: '哥伦比亚 colombia co' },
    { code: 'VE', name: '🇻🇪 委内瑞拉 (Venezuela)', search: '委内瑞拉 venezuela ve' },
    { code: 'GY', name: '🇬🇾 圭亚那 (Guyana)', search: '圭亚那 guyana gy' },
    { code: 'SR', name: '🇸🇷 苏里南 (Suriname)', search: '苏里南 suriname sr' },
    { code: 'EC', name: '🇪🇨 厄瓜多尔 (Ecuador)', search: '厄瓜多尔 ecuador ec' },
    { code: 'PE', name: '🇵🇪 秘鲁 (Peru)', search: '秘鲁 peru pe' },
    { code: 'BR', name: '🇧🇷 巴西 (Brazil)', search: '巴西 brazil br' },
    { code: 'BO', name: '🇧🇴 玻利维亚 (Bolivia)', search: '玻利维亚 bolivia bo' },
    { code: 'PY', name: '🇵🇾 巴拉圭 (Paraguay)', search: '巴拉圭 paraguay py' },
    { code: 'UY', name: '🇺🇾 乌拉圭 (Uruguay)', search: '乌拉圭 uruguay uy' },
    { code: 'CL', name: '🇨🇱 智利 (Chile)', search: '智利 chile cl' },
    { code: 'AR', name: '🇦🇷 阿根廷 (Argentina)', search: '阿根廷 argentina ar' },

    // Oceania
    { code: 'PG', name: '🇵🇬 巴布亚新几内亚 (Papua New Guinea)', search: '巴布亚新几内亚 papua new guinea pg' },
    { code: 'FJ', name: '🇫🇯 斐济 (Fiji)', search: '斐济 fiji fj' },
    { code: 'SB', name: '🇸🇧 所罗门群岛 (Solomon Islands)', search: '所罗门群岛 solomon islands sb' },
    { code: 'VU', name: '🇻🇺 瓦努阿图 (Vanuatu)', search: '瓦努阿图 vanuatu vu' },
    { code: 'WS', name: '🇼🇸 萨摩亚 (Samoa)', search: '萨摩亚 samoa ws' },
    { code: 'TO', name: '🇹🇴 汤加 (Tonga)', search: '汤加 tonga to' },
    { code: 'TV', name: '🇹🇻 图瓦卢 (Tuvalu)', search: '图瓦卢 tuvalu tv' },
    { code: 'NR', name: '🇳🇷 瑙鲁 (Nauru)', search: '瑙鲁 nauru nr' },
    { code: 'KI', name: '🇰🇮 基里巴斯 (Kiribati)', search: '基里巴斯 kiribati ki' },
    { code: 'FM', name: '🇫🇲 密克罗尼西亚 (Micronesia)', search: '密克罗尼西亚 micronesia fm' },
    { code: 'MH', name: '🇲🇭 马绍尔群岛 (Marshall Islands)', search: '马绍尔群岛 marshall islands mh' },
    { code: 'PW', name: '🇵🇼 帕劳 (Palau)', search: '帕劳 palau pw' },

    // Africa
    { code: 'ZA', name: '🇿🇦 南非 (South Africa)', search: '南非 south africa za' },
    { code: 'EG', name: '🇪🇬 埃及 (Egypt)', search: '埃及 egypt eg' },
    { code: 'MA', name: '🇲🇦 摩洛哥 (Morocco)', search: '摩洛哥 morocco ma' },
    { code: 'DZ', name: '🇩🇿 阿尔及利亚 (Algeria)', search: '阿尔及利亚 algeria dz' },
    { code: 'TN', name: '🇹🇳 突尼斯 (Tunisia)', search: '突尼斯 tunisia tn' },
    { code: 'LY', name: '🇱🇾 利比亚 (Libya)', search: '利比亚 libya ly' },
    { code: 'SD', name: '🇸🇩 苏丹 (Sudan)', search: '苏丹 sudan sd' },
    { code: 'SS', name: '🇸🇸 南苏丹 (South Sudan)', search: '南苏丹 south sudan ss' },
    { code: 'ET', name: '🇪🇹 埃塞俄比亚 (Ethiopia)', search: '埃塞俄比亚 ethiopia et' },
    { code: 'KE', name: '🇰🇪 肯尼亚 (Kenya)', search: '肯尼亚 kenya ke' },
    { code: 'TZ', name: '🇹🇿 坦桑尼亚 (Tanzania)', search: '坦桑尼亚 tanzania tz' },
    { code: 'UG', name: '🇺🇬 乌干达 (Uganda)', search: '乌干达 uganda ug' },
    { code: 'RW', name: '🇷🇼 卢旺达 (Rwanda)', search: '卢旺达 rwanda rw' },
    { code: 'BI', name: '🇧🇮 布隆迪 (Burundi)', search: '布隆迪 burundi bi' },
    { code: 'SO', name: '🇸🇴 索马里 (Somalia)', search: '索马里 somalia so' },
    { code: 'DJ', name: '🇩🇯 吉布提 (Djibouti)', search: '吉布提 djibouti dj' },
    { code: 'ER', name: '🇪🇷 厄立特里亚 (Eritrea)', search: '厄立特里亚 eritrea er' },
    { code: 'NG', name: '🇳🇬 尼日利亚 (Nigeria)', search: '尼日利亚 nigeria ng' },
    { code: 'GH', name: '🇬🇭 加纳 (Ghana)', search: '加纳 ghana gh' },
    { code: 'CI', name: '🇨🇮 科特迪瓦 (Ivory Coast)', search: '科特迪瓦 ivory coast ci' },
    { code: 'SN', name: '🇸🇳 塞内加尔 (Senegal)', search: '塞内加尔 senegal sn' },
    { code: 'GM', name: '🇬🇲 冈比亚 (Gambia)', search: '冈比亚 gambia gm' },
    { code: 'GN', name: '🇬🇳 几内亚 (Guinea)', search: '几内亚 guinea gn' },
    { code: 'GW', name: '🇬🇼 几内亚比绍 (Guinea-Bissau)', search: '几内亚比绍 guinea bissau gw' },
    { code: 'SL', name: '🇸🇱 塞拉利昂 (Sierra Leone)', search: '塞拉利昂 sierra leone sl' },
    { code: 'LR', name: '🇱🇷 利比里亚 (Liberia)', search: '利比里亚 lr' },
    { code: 'ML', name: '🇲🇱 马里 (Mali)', search: '马里 mali ml' },
    { code: 'BF', name: '🇧🇫 布基纳法索 (Burkina Faso)', search: '布基纳法索 burkina faso bf' },
    { code: 'NE', name: '🇳🇪 尼日尔 (Niger)', search: '尼日尔 niger ne' },
    { code: 'TD', name: '🇹🇩 乍得 (Chad)', search: '乍得 chad td' },
    { code: 'CF', name: '🇨🇫 中非 (Central African Republic)', search: '中非 central african republic cf' },
    { code: 'CM', name: '🇨🇲 喀麦隆 (Cameroon)', search: '喀麦隆 cameroon cm' },
    { code: 'GQ', name: '🇬🇶 赤道几内亚 (Equatorial Guinea)', search: '赤道几内亚 equatorial guinea gq' },
    { code: 'GA', name: '🇬🇦 加蓬 (Gabon)', search: '加蓬 gabon ga' },
    { code: 'CG', name: '🇨🇬 刚果（布） (Republic of the Congo)', search: '刚果布 republic of the congo cg' },
    { code: 'CD', name: '🇨🇩 刚果（金） (Democratic Republic of the Congo)', search: '刚果金 democratic republic of the congo cd' },
    { code: 'AO', name: '🇦🇴 安哥拉 (Angola)', search: '安哥拉 angola ao' },
    { code: 'ZM', name: '🇿🇲 赞比亚 (Zambia)', search: '赞比亚 zambia zm' },
    { code: 'MW', name: '🇲🇼 马拉维 (Malawi)', search: '马拉维 malawi mw' },
    { code: 'MZ', name: '🇲🇿 莫桑比克 (Mozambique)', search: '莫桑比克 mozambique mz' },
    { code: 'ZW', name: '🇿🇼 津巴布韦 (Zimbabwe)', search: '津巴布韦 zimbabwe zw' },
    { code: 'NA', name: '🇳🇦 纳米比亚 (Namibia)', search: '纳米比亚 namibia na' },
    { code: 'BW', name: '🇧🇼 博茨瓦纳 (Botswana)', search: '博茨瓦纳 botswana bw' },
    { code: 'SZ', name: '🇸🇿 斯威士兰 (Eswatini)', search: '斯威士兰 eswatini sz' },
    { code: 'LS', name: '🇱🇸 莱索托 (Lesotho)', search: '莱索托 lesotho ls' },
    { code: 'MG', name: '🇲🇬 马达加斯加 (Madagascar)', search: '马达加斯加 madagascar mg' },
    { code: 'MU', name: '🇲🇺 毛里求斯 (Mauritius)', search: '毛里求斯 mauritius mu' },
    { code: 'SC', name: '🇸🇨 塞舌尔 (Seychelles)', search: '塞舌尔 seychelles sc' },
    { code: 'KM', name: '🇰🇲 科摩罗 (Comoros)', search: '科摩罗 comoros km' },
    { code: 'CV', name: '🇨🇻 佛得角 (Cape Verde)', search: '佛得角 cape verde cv' },
    { code: 'ST', name: '🇸🇹 圣多美和普林西比 (Sao Tome and Principe)', search: '圣多美和普林西比 sao tome and principe st' },
    { code: 'MR', name: '🇲🇷 毛里塔尼亚 (Mauritania)', search: '毛里塔尼亚 mauritania mr' },

    { code: 'OTHER', name: '🌐 其他国家/地区', search: '其他国家 地区 other region' }
  ];

  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const sortedCountries = (() => {
    const topCodes = ['', 'CN', 'HK', 'MO', 'TW'];
    const bottomCodes = ['OTHER'];
    const getEnglishName = (name: string) => {
      const match = name.match(/\(([^)]+)\)/);
      return match ? match[1].toLowerCase() : name.toLowerCase();
    };

    const top = countries.filter(c => topCodes.includes(c.code))
      .sort((a, b) => topCodes.indexOf(a.code) - topCodes.indexOf(b.code));

    const bottom = countries.filter(c => bottomCodes.includes(c.code));

    const middle = countries.filter(c => !topCodes.includes(c.code) && !bottomCodes.includes(c.code))
      .sort((a, b) => {
        const nameA = getEnglishName(a.name);
        const nameB = getEnglishName(b.name);
        return nameA.localeCompare(nameB);
      });

    return [...top, ...middle, ...bottom];
  })();

  const filteredCountries = sortedCountries.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    (c.search && c.search.toLowerCase().includes(countrySearch.toLowerCase())) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const selectedCountryObj = countries.find(c => c.code === country) || countries.find(c => c.code === '') || countries[0];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNick = nick.trim();
    if (!cleanNick) return;

    setSaving(true);
    setProfileSuccess('');
    setProfileError('');
    let finalGender = genderType as string;
    if (genderType === 'other') {
      finalGender = `other:${customGender.trim()}`;
    }

    const success = await updateProfile({
      nickname: cleanNick,
      custom_transfer_path: customPath.trim(),
      bio: bio.trim(),
      gender: finalGender,
      birthday: birthday,
      country: country,
      city: city.trim(),
      website: website.trim(),
      job: job.trim()
    });
    setSaving(false);
    if (success) {
      setProfileSuccess('个人资料保存成功！');
      setTimeout(() => setProfileSuccess(''), 3000);
    } else {
      setProfileError('保存失败，请稍后重试');
      setTimeout(() => setProfileError(''), 3000);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (!oldPwd.trim() || !newPwd.trim()) { setPwdError('请填写当前密码和新密码'); return; }
    if (newPwd.length < 6) { setPwdError('新密码不能少于 6 位'); return; }
    if (newPwd !== confirmPwd) { setPwdError('两次输入的新密码不一致'); return; }
    if (newPwd === oldPwd) { setPwdError('新密码不能与当前密码相同'); return; }
    setPwdChanging(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.error || '修改密码失败'); return; }
      setPwdSuccess('密码修改成功！');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch { setPwdError('网络错误，请稍后重试'); }
    finally { setPwdChanging(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploading(true);
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    await uploadAvatar(file);
    setUploading(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <style>{`
        .ac-header { display:flex;align-items:center;height:48px;padding:0 16px;border-bottom:1px solid var(--border);gap:12px;flex-shrink:0;background:var(--bg); }
        .ac-back-btn { background:none;color:var(--text);padding:6px;display:flex;align-items:center;border-radius:50%;transition:background-color 0.2s; }
        .ac-back-btn:hover { background:var(--hover); }
        .ac-header-title { font-weight:700;font-size:15px; }
        
        .ac-layout { display:flex; flex:1; overflow:hidden; }
        .ac-sidebar { width:220px; border-right:1px solid var(--border); padding:16px 8px; display:flex; flex-direction:column; gap:6px; background:var(--bg-paper); flex-shrink:0; }
        .ac-tab-btn { display:flex; align-items:center; gap:10px; padding:10px 14px; border:none; background:none; color:var(--text-dim); font-weight:500; border-radius:8px; cursor:pointer; transition:all 0.2s ease; text-align:left; font-size:14px; }
        .ac-tab-btn:hover { background:var(--hover); color:var(--text); }
        .ac-tab-btn.active { background:var(--brand-blue); color:#fff; }
        
        .ac-main { flex:1; overflow-y:auto; padding:24px 16px; }
        .ac-pane { max-width:550px; margin:0 auto; display:flex; flex-direction:column; gap:20px; }

        .pf-section { padding:20px; border:1px solid var(--border); border-radius:12px; background:var(--bg-paper); display:flex; flex-direction:column; gap:16px; }
        .pf-section-title { font-size:13px; font-weight:700; color:var(--brand-blue); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:4px; }
        
        .pf-row { display:flex; flex-direction:column; gap:6px; position:relative; }
        .pf-row label { font-size:12px; font-weight:600; color:var(--text-dim); }
        .pf-row input, .pf-row select, .pf-row textarea { background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px 12px; font-size:14px; outline:none; transition:border-color 0.2s; width:100%; box-sizing:border-box; }
        .pf-row input:focus, .pf-row select:focus, .pf-row textarea:focus { border-color:var(--brand-blue); }
        
        .pf-char-counter { position:absolute; right:8px; top:0; font-size:11px; color:var(--text-dim); }
        .pf-gender-group { display:flex; gap:10px; flex-wrap:wrap; }
        .pf-gender-chip { padding:8px 16px; border:1px solid var(--border); border-radius:20px; cursor:pointer; font-size:13px; color:var(--text); transition:all 0.2s; background:var(--bg); }
        .pf-gender-chip:hover { border-color:var(--brand-blue); }
        .pf-gender-chip.active { background:var(--brand-blue); color:#fff; border-color:var(--brand-blue); }

        .pf-center { display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px 0; }
        .pf-avatar-wrapper { position:relative; cursor:pointer; border-radius:50%; overflow:hidden; width:72px; height:72px; display:flex; align-items:center; justify-content:center; border:2px solid var(--border); transition:border-color 0.2s, transform 0.2s; }
        .pf-avatar-wrapper:hover { border-color:var(--brand-blue); transform:scale(1.05); }
        .pf-avatar-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.2s; color:#fff; }
        .pf-avatar-wrapper:hover .pf-avatar-overlay { opacity:1; }
        .pf-avatar-uploading { position:absolute; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; }
        .pf-name { font-size:18px; font-weight:700; color:var(--text); }
        .pf-username { font-size:12px; color:var(--text-dim); }

        .pf-form { display:flex; flex-direction:column; gap:16px; }
        .pf-pwd-error { padding:9px 12px; background:rgba(220,53,69,0.08); border:1px solid rgba(220,53,69,0.25); border-radius:10px; font-size:13px; color:#dc3545; }
        .pf-pwd-success { padding:9px 12px; background:rgba(51,144,236,0.08); border:1px solid rgba(51,144,236,0.25); border-radius:10px; font-size:13px; color:var(--brand-blue); }
        .btn-round { border-radius:24px; padding:12px 20px; font-weight:600; cursor:pointer; transition:opacity 0.2s; }
        .btn-round:disabled { opacity:0.6; cursor:not-allowed; }

        .pf-pwd-field { position:relative; }
        .pf-pwd-field input { padding-right:38px; }
        .pf-pwd-eye { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-dim); cursor:pointer; padding:4px; display:flex; align-items:center; border-radius:6px; transition:color 0.15s; }
        .pf-pwd-eye:hover { color:var(--text); }
        
        @media (max-width: 600px) {
          .ac-layout { flex-direction:column; }
          .ac-sidebar { width:100%; border-right:none; border-bottom:1px solid var(--border); flex-direction:row; overflow-x:auto; padding:8px; }
          .ac-tab-btn { padding:8px 12px; font-size:13px; }
        }
      `}</style>
      <div className="ac-header">
        <Link to="/profile" className="ac-back-btn" title="返回设置">
          <ArrowBackIcon />
        </Link>
        <span className="ac-header-title">账户设置</span>
      </div>

      <div className="ac-layout">
        <div className="ac-sidebar">
          <button className={`ac-tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <ProfileIcon /> 个人资料
          </button>
          <button className={`ac-tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
            <SecurityIcon /> 账号安全
          </button>
          <button className={`ac-tab-btn ${activeTab === 'app' ? 'active' : ''}`} onClick={() => setActiveTab('app')}>
            <AppIcon /> 应用设置
          </button>
        </div>

        <div className="ac-main">
          <div className="ac-pane">
            {activeTab === 'profile' && (
              <>
                <div className="pf-section pf-center">
                  <div className="pf-avatar-wrapper" onClick={() => fileInputRef.current?.click()} title="更换头像">
                    <Avatar name={user?.nickname || '?'} url={user?.avatar} size={68} fontSize={26} />
                    <div className="pf-avatar-overlay">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                      </svg>
                    </div>
                    {uploading && <div className="pf-avatar-uploading">上传中</div>}
                  </div>
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
                  <div className="pf-name">{user?.nickname}</div>
                  <div className="pf-username">@{user?.username}</div>
                </div>

                <div className="pf-section">
                  <div className="pf-section-title">基本信息</div>
                  <form onSubmit={handleSaveProfile} className="pf-form">
                    {profileError && <div className="pf-pwd-error">{profileError}</div>}
                    {profileSuccess && <div className="pf-pwd-success">✓ {profileSuccess}</div>}
                    <div className="pf-row">
                      <label>昵称 *</label>
                      <input value={nick} onChange={e => setNick(e.target.value)} disabled={saving} placeholder="输入昵称" required />
                    </div>

                    <div className="pf-row">
                      <label>个人简介</label>
                      <span className="pf-char-counter">{bio.length}/100</span>
                      <textarea
                        value={bio}
                        onChange={e => setBio(e.target.value.slice(0, 100))}
                        disabled={saving}
                        placeholder="用一句话介绍自己（100字以内）"
                        rows={3}
                        style={{ resize: 'none' }}
                      />
                    </div>

                    <div className="pf-row">
                      <label>性别</label>
                      <div className="pf-gender-group">
                        <button type="button" className={`pf-gender-chip ${genderType === 'male' ? 'active' : ''}`} onClick={() => setGenderType('male')}>男</button>
                        <button type="button" className={`pf-gender-chip ${genderType === 'female' ? 'active' : ''}`} onClick={() => setGenderType('female')}>女</button>
                        <button type="button" className={`pf-gender-chip ${genderType === 'other' ? 'active' : ''}`} onClick={() => setGenderType('other')}>其他</button>
                        <button type="button" className={`pf-gender-chip ${genderType === 'unspecified' ? 'active' : ''}`} onClick={() => setGenderType('unspecified')}>不填</button>
                      </div>
                      {genderType === 'other' && (
                        <input
                          style={{ marginTop: '8px' }}
                          placeholder="请输入自定义性别"
                          value={customGender}
                          onChange={e => setCustomGender(e.target.value)}
                          disabled={saving}
                        />
                      )}
                    </div>

                    <div className="pf-row">
                      <label>生日</label>
                      <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} disabled={saving} />
                    </div>

                    <div className="pf-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', zIndex: 10 }}>
                      <div ref={countryRef} style={{ position: 'relative' }}>
                        <label>国家/地区</label>
                        <button
                          type="button"
                          onClick={() => { if (!saving) { setCountryDropdownOpen(!countryDropdownOpen); setCountrySearch(''); } }}
                          className="pf-country-select-btn"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '10px 12px',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            color: 'var(--text)',
                            fontSize: '14px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            marginTop: '6px'
                          }}
                        >
                          <span>{selectedCountryObj?.name || '🏳️ 未选择'}</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: countryDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                        {countryDropdownOpen && (
                          <div
                            className="pf-country-dropdown"
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              zIndex: 100,
                              marginTop: '4px',
                              background: 'var(--bg-paper)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              padding: '8px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              maxHeight: '260px'
                            }}
                          >
                            <input
                              type="text"
                              placeholder="搜索国家/地区..."
                              value={countrySearch}
                              onChange={e => setCountrySearch(e.target.value)}
                              autoFocus
                              style={{
                                padding: '8px 10px',
                                fontSize: '13px',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                background: 'var(--bg)',
                                color: 'var(--text)',
                                outline: 'none',
                                width: '100%',
                                boxSizing: 'border-box'
                              }}
                            />
                            <div
                              style={{
                                overflowY: 'auto',
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                maxHeight: '190px'
                              }}
                            >
                              {filteredCountries.length > 0 ? (
                                filteredCountries.map(c => (
                                  <button
                                    key={c.code}
                                    type="button"
                                    onClick={() => {
                                      setCountry(c.code);
                                      setCountryDropdownOpen(false);
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '8px 10px',
                                      background: c.code === country ? 'var(--hover)' : 'transparent',
                                      border: 'none',
                                      borderRadius: '6px',
                                      color: 'var(--text)',
                                      fontSize: '13px',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={e => {
                                      if (c.code !== country) e.currentTarget.style.background = 'var(--hover)';
                                    }}
                                    onMouseLeave={e => {
                                      if (c.code !== country) e.currentTarget.style.background = 'transparent';
                                    }}
                                  >
                                    {c.name}
                                  </button>
                                ))
                              ) : (
                                <span style={{ padding: '8px', fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center' }}>未找到匹配的国家/地区</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label>城市</label>
                        <input placeholder="请输入城市" value={city} onChange={e => setCity(e.target.value)} disabled={saving} style={{ marginTop: '6px' }} />
                      </div>
                    </div>

                    <div className="pf-row">
                      <label>职业</label>
                      <input placeholder="请输入职业" value={job} onChange={e => setJob(e.target.value)} disabled={saving} />
                    </div>

                    <div className="pf-row">
                      <label>个人主页</label>
                      <input placeholder="https://example.com" value={website} onChange={e => setWebsite(e.target.value)} disabled={saving} />
                    </div>

                    <div className="pf-row">
                      <label>聊天转存文件夹 (默认：聊天记录转存)</label>
                      <input placeholder="例如：我的文件/聊天收集" value={customPath} onChange={e => setCustomPath(e.target.value)} disabled={saving} />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary btn-round"
                      disabled={saving || !nick.trim()}
                    >
                      {saving ? '保存中...' : '保存资料'}
                    </button>
                  </form>
                </div>
              </>
            )}

            {activeTab === 'security' && (
              <div className="pf-section">
                <div className="pf-section-title">修改密码</div>
                <form onSubmit={handleChangePassword} className="pf-form">
                  {pwdError && <div className="pf-pwd-error">{pwdError}</div>}
                  {pwdSuccess && <div className="pf-pwd-success">✓ {pwdSuccess}</div>}
                  <div className="pf-row">
                    <label>当前密码</label>
                    <div className="pf-pwd-field">
                      <input type={showOldPwd ? 'text' : 'password'} placeholder="输入当前密码" value={oldPwd} onChange={e => { setOldPwd(e.target.value); setPwdError(''); setPwdSuccess(''); }} disabled={pwdChanging} />
                      <button type="button" className="pf-pwd-eye" tabIndex={-1} onClick={() => setShowOldPwd(v => !v)}>{showOldPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
                    </div>
                  </div>
                  <div className="pf-row">
                    <label>新密码</label>
                    <div className="pf-pwd-field">
                      <input type={showNewPwd ? 'text' : 'password'} placeholder="至少 6 位" value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdError(''); setPwdSuccess(''); }} disabled={pwdChanging} />
                      <button type="button" className="pf-pwd-eye" tabIndex={-1} onClick={() => setShowNewPwd(v => !v)}>{showNewPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
                    </div>
                  </div>
                  <div className="pf-row">
                    <label>确认新密码</label>
                    <div className="pf-pwd-field">
                      <input type={showConfirmPwd ? 'text' : 'password'} placeholder="再次输入新密码" value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setPwdError(''); setPwdSuccess(''); }} disabled={pwdChanging} />
                      <button type="button" className="pf-pwd-eye" tabIndex={-1} onClick={() => setShowConfirmPwd(v => !v)}>{showConfirmPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-round" disabled={pwdChanging || !oldPwd.trim() || !newPwd.trim() || !confirmPwd.trim()}>
                    {pwdChanging ? '正在修改...' : '修改密码'}
                  </button>
                </form>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

                <button className="btn btn-danger btn-round" onClick={logout} style={{ width: '100%' }}>退出登录</button>
              </div>
            )}

            {activeTab === 'app' && (
              <div className="pf-section">
                <div className="pf-section-title">应用与存储设置</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                    清除保存在本浏览器 IndexedDB 中的所有离线聊天记录缓存。此操作不会影响云端数据，但本地历史记录将被清空。
                  </p>
                  <button
                    className="btn btn-secondary btn-round"
                    onClick={async () => {
                      if (confirm("确定要清除当前浏览器上的所有本地聊天记录吗？这不会影响其他设备，但此操作不可撤销。")) {
                        await deleteAllLocalChatHistories();
                      }
                    }}
                    style={{ width: '100%', border: '1px solid var(--border)', background: 'var(--bg-paper)', color: 'var(--badge-unread)' }}
                  >
                    清除本地所有聊天记录
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedImage && (
        <AvatarCropper imageSrc={selectedImage} onCrop={handleCropComplete} onClose={() => { setSelectedImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
      )}
    </div>
  );
}
