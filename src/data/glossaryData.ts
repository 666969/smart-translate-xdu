import { extraGlossaryBooks } from "./extraGlossaryBooks";
import { moreGlossaryBooks } from "./moreGlossaryBooks";

export interface GlossaryWord {
  term_fr: string;
  term_zh: string;
  term_en: string;
}

export interface GlossaryModule {
  name: string;
  words: GlossaryWord[];
}

export interface GlossaryBook {
  title: string;
  modules: GlossaryModule[];
}

export const glossaryData: GlossaryBook[] = [
  {
    title: "模拟与数字电子技术 (Électronique Analogique et Numérique)",
    modules: [
      {
        name: "基础元器件 (Composants de base)",
        words: [
          { term_fr: "Résistance", term_zh: "电阻", term_en: "Resistor" },
          { term_fr: "Condensateur", term_zh: "电容", term_en: "Capacitor" },
          { term_fr: "Inductance / Bobine", term_zh: "电感 / 线圈", term_en: "Inductor / Coil" },
          { term_fr: "Diode", term_zh: "二极管", term_en: "Diode" },
          { term_fr: "Transistor bipolaire", term_zh: "双极型晶体管 (三极管)", term_en: "Bipolar Junction Transistor (BJT)" },
          { term_fr: "Transistor à effet de champ (TEC)", term_zh: "场效应管", term_en: "Field Effect Transistor (FET)" },
          { term_fr: "MOSFET", term_zh: "金属氧化物半导体场效应管", term_en: "MOSFET" },
          { term_fr: "Amplificateur opérationnel (AOP)", term_zh: "运算放大器 (运放)", term_en: "Operational Amplifier (Op-Amp)" },
          { term_fr: "Composants passifs", term_zh: "无源器件", term_en: "Passive components" },
          { term_fr: "Composants actifs", term_zh: "有源器件", term_en: "Active components" },
          { term_fr: "Circuit intégré (CI)", term_zh: "集成电路", term_en: "Integrated Circuit (IC)" }
        ]
      },
      {
        name: "基础概念 (Concepts fondamentaux)",
        words: [
          { term_fr: "Tension", term_zh: "电压", term_en: "Voltage" },
          { term_fr: "Courant", term_zh: "电流", term_en: "Current" },
          { term_fr: "Puissance", term_zh: "功率", term_en: "Power" },
          { term_fr: "Impédance", term_zh: "阻抗", term_en: "Impedance" },
          { term_fr: "Admittance", term_zh: "导纳", term_en: "Admittance" },
          { term_fr: "Fréquence", term_zh: "频率", term_en: "Frequency" },
          { term_fr: "Phase", term_zh: "相位", term_en: "Phase" },
          { term_fr: "Bande passante", term_zh: "带宽", term_en: "Bandwidth" },
          { term_fr: "Gain", term_zh: "增益", term_en: "Gain" },
          { term_fr: "Atténuation", term_zh: "衰减", term_en: "Attenuation" },
          { term_fr: "Valeur efficace", term_zh: "有效值 (RMS)", term_en: "RMS value" },
          { term_fr: "Valeur moyenne", term_zh: "平均值 (直流分量)", term_en: "Mean value / DC component" }
        ]
      },
      {
        name: "放大与信号处理 (Amplification & Traitement du signal)",
        words: [
          { term_fr: "Amplification", term_zh: "放大", term_en: "Amplification" },
          { term_fr: "Contre-réaction", term_zh: "负反馈", term_en: "Negative Feedback" },
          { term_fr: "Boucle ouverte", term_zh: "开环", term_en: "Open loop" },
          { term_fr: "Boucle fermée", term_zh: "闭环", term_en: "Closed loop" },
          { term_fr: "Taux de réjection du mode commun (TRMC)", term_zh: "共模抑制比 (CMRR)", term_en: "Common-Mode Rejection Ratio" },
          { term_fr: "Produit gain-bande", term_zh: "增益带宽积", term_en: "Gain-bandwidth product" },
          { term_fr: "Distorsion", term_zh: "失真", term_en: "Distortion" },
          { term_fr: "Bruit", term_zh: "噪声", term_en: "Noise" },
          { term_fr: "Rapport signal sur bruit (RSB)", term_zh: "信噪比 (SNR)", term_en: "Signal-to-Noise Ratio" },
          { term_fr: "Oscillation", term_zh: "振荡", term_en: "Oscillation" },
          { term_fr: "Oscillateur", term_zh: "振荡器", term_en: "Oscillator" },
          { term_fr: "Amplificateur différentiel", term_zh: "差分放大器", term_en: "Differential amplifier" },
          { term_fr: "Miroir de courant", term_zh: "电流镜像 (电流镜)", term_en: "Current mirror" },
          { term_fr: "Montage Darlington", term_zh: "达林顿组态 (达林顿管)", term_en: "Darlington configuration" }
        ]
      },
      {
        name: "滤波与网络 (Filtres & Réseaux)",
        words: [
          { term_fr: "Filtrage", term_zh: "滤波", term_en: "Filtering" },
          { term_fr: "Filtre passe-bas", term_zh: "低通滤波器", term_en: "Low-pass filter" },
          { term_fr: "Filtre passe-haut", term_zh: "高通滤波器", term_en: "High-pass filter" },
          { term_fr: "Filtre passe-bande", term_zh: "带通滤波器", term_en: "Band-pass filter" },
          { term_fr: "Filtre coupe-bande (réjecteur)", term_zh: "带阻滤波器 (陷波器)", term_en: "Band-stop filter / Notch filter" },
          { term_fr: "Fréquence de coupure", term_zh: "截止频率", term_en: "Cutoff frequency" },
          { term_fr: "Diagramme de Bode", term_zh: "伯德图 / 波特图", term_en: "Bode plot" },
          { term_fr: "Pôle", term_zh: "极点", term_en: "Pole" },
          { term_fr: "Zéro", term_zh: "零点", term_en: "Zero" },
          { term_fr: "Résonance", term_zh: "谐振 / 共振", term_en: "Resonance" }
        ]
      },
      {
        name: "调制与传输 (Modulation & Transmission)",
        words: [
          { term_fr: "Modulation", term_zh: "调制", term_en: "Modulation" },
          { term_fr: "Démodulation", term_zh: "解调", term_en: "Demodulation" },
          { term_fr: "Modulation d'amplitude (AM)", term_zh: "调幅", term_en: "Amplitude Modulation (AM)" },
          { term_fr: "Modulation de fréquence (FM)", term_zh: "调频", term_en: "Frequency Modulation (FM)" },
          { term_fr: "Fréquence porteuse", term_zh: "载波频率", term_en: "Carrier frequency" },
          { term_fr: "Ligne de transmission", term_zh: "传输线", term_en: "Transmission line" },
          { term_fr: "Fibre optique", term_zh: "光纤", term_en: "Optical fiber" },
          { term_fr: "Boucle à verrouillage de phase (PLL)", term_zh: "锁相环", term_en: "Phase-Locked Loop (PLL)" }
        ]
      },
      {
        name: "数字电子与转换 (Électronique Numérique & Conversion)",
        words: [
          { term_fr: "Signal analogique", term_zh: "模拟信号", term_en: "Analog signal" },
          { term_fr: "Signal numérique", term_zh: "数字信号", term_en: "Digital signal" },
          { term_fr: "Échantillonnage", term_zh: "采样", term_en: "Sampling" },
          { term_fr: "Théorème de Shannon", term_zh: "香农定理", term_en: "Shannon's theorem" },
          { term_fr: "Quantification", term_zh: "量化", term_en: "Quantization" },
          { term_fr: "Convertisseur analogique-numérique (CAN)", term_zh: "模数转换器 (ADC)", term_en: "Analog-to-Digital Converter" },
          { term_fr: "Convertisseur numérique-analogique (CNA)", term_zh: "数模转换器 (DAC)", term_en: "Digital-to-Analog Converter" },
          { term_fr: "Logique combinatoire", term_zh: "组合逻辑", term_en: "Combinational logic" },
          { term_fr: "Logique séquentielle", term_zh: "时序逻辑", term_en: "Sequential logic" },
          { term_fr: "Porte logique", term_zh: "逻辑门", term_en: "Logic gate" },
          { term_fr: "Bascule", term_zh: "触发器", term_en: "Flip-flop" },
          { term_fr: "Registre", term_zh: "寄存器", term_en: "Register" },
          { term_fr: "Compteur", term_zh: "计数器", term_en: "Counter" },
          { term_fr: "Multiplexeur", term_zh: "多路复用器", term_en: "Multiplexer" },
          { term_fr: "Horloge", term_zh: "时钟", term_en: "Clock" }
        ]
      },
      {
        name: "电源与功率电子 (Alimentation & Puissance)",
        words: [
          { term_fr: "Alimentation", term_zh: "电源", term_en: "Power supply" },
          { term_fr: "Redresseur / Redressement", term_zh: "整流器 / 整流", term_en: "Rectifier / Rectification" },
          { term_fr: "Lissage", term_zh: "平滑 / 滤波", term_en: "Smoothing" },
          { term_fr: "Régulateur de tension", term_zh: "稳压器 / 稳压块", term_en: "Voltage regulator" },
          { term_fr: "Alimentation à découpage", term_zh: "开关电源", term_en: "Switch-mode power supply (SMPS)" },
          { term_fr: "Transformateur", term_zh: "变压器", term_en: "Transformer" },
          { term_fr: "Hacheur", term_zh: "斩波器 / 直流-直流变换器", term_en: "Chopper / DC-DC converter" },
          { term_fr: "Onduleur", term_zh: "逆变器", term_en: "Inverter" },
          { term_fr: "Circuit de puissance", term_zh: "功率电路", term_en: "Power circuit" },
          { term_fr: "Dissipateur thermique", term_zh: "散热器", term_en: "Heatsink" },
          { term_fr: "Résistance thermique", term_zh: "热阻", term_en: "Thermal resistance" },
          { term_fr: "Effet Joule", term_zh: "焦耳效应", term_en: "Joule effect" }
        ]
      },
      {
        name: "伺服与系统控制 (Asservissements & Systèmes)",
        words: [
          { term_fr: "Asservissement", term_zh: "伺服系统 / 控制系统", term_en: "Servomechanism / Control system" },
          { term_fr: "Système linéaire", term_zh: "线性系统", term_en: "Linear system" },
          { term_fr: "Stabilité", term_zh: "稳定性", term_en: "Stability" },
          { term_fr: "Marge de phase", term_zh: "相位裕度", term_en: "Phase margin" },
          { term_fr: "Marge de gain", term_zh: "增益裕度", term_en: "Gain margin" },
          { term_fr: "Correcteur / Régulateur", term_zh: "补偿器 / 控制器", term_en: "Compensator / Controller" },
          { term_fr: "Régulateur PID", term_zh: "PID控制器", term_en: "PID controller" },
          { term_fr: "Réponse transitoire", term_zh: "瞬态响应", term_en: "Transient response" },
          { term_fr: "Régime permanent", term_zh: "稳态", term_en: "Steady state" },
          { term_fr: "Fonction de transfert", term_zh: "传递函数", term_en: "Transfer function" }
        ]
      },
      {
        name: "特殊半导体与仪器 (Composants spécifiques & Instruments)",
        words: [
          { term_fr: "Diode Zener", term_zh: "齐纳二极管 (稳压二极管)", term_en: "Zener diode" },
          { term_fr: "Diode électroluminescente (LED)", term_zh: "发光二极管", term_en: "Light-Emitting Diode (LED)" },
          { term_fr: "Photodiode", term_zh: "光电二极管", term_en: "Photodiode" },
          { term_fr: "Thyristor", term_zh: "晶闸管 (可控硅)", term_en: "Thyristor" },
          { term_fr: "Triac", term_zh: "双向晶闸管", term_en: "TRIAC" },
          { term_fr: "Court-circuit", term_zh: "短路", term_en: "Short circuit" },
          { term_fr: "Multimètre", term_zh: "万用表", term_en: "Multimeter" },
          { term_fr: "Oscilloscope", term_zh: "示波器", term_en: "Oscilloscope" }
        ]
      }
    ]
  },
  {
    title: "微电子与数字电路 (Micro-électronique et Numérique)",
    modules: [
      {
        name: "基础概念与逻辑代数 (Concepts de base et Algèbre de logique)",
        words: [
          { term_fr: "Algèbre de logique", term_zh: "逻辑代数 / 布尔代数", term_en: "Boolean algebra / Logic algebra" },
          { term_fr: "Variable logique", term_zh: "逻辑变量", term_en: "Logic variable" },
          { term_fr: "Fonction logique", term_zh: "逻辑函数", term_en: "Logic function" },
          { term_fr: "Table de vérité", term_zh: "真值表", term_en: "Truth table" },
          { term_fr: "Équation booléenne", term_zh: "布尔方程", term_en: "Boolean equation" },
          { term_fr: "Théorème de De Morgan", term_zh: "德摩根定理", term_en: "De Morgan's theorem" },
          { term_fr: "Tableau de Karnaugh", term_zh: "卡诺图", term_en: "Karnaugh map" },
          { term_fr: "Niveau logique", term_zh: "逻辑电平", term_en: "Logic level" },
          { term_fr: "Bit", term_zh: "比特 / 位", term_en: "Bit" },
          { term_fr: "Octet", term_zh: "字节", term_en: "Byte" }
        ]
      },
      {
        name: "逻辑门电路 (Portes logiques)",
        words: [
          { term_fr: "Porte logique", term_zh: "逻辑门", term_en: "Logic gate" },
          { term_fr: "Inverseur / Porte NON", term_zh: "反相器 / 非门", term_en: "Inverter / NOT gate" },
          { term_fr: "Porte ET", term_zh: "与门", term_en: "AND gate" },
          { term_fr: "Porte OU", term_zh: "或门", term_en: "OR gate" },
          { term_fr: "Porte NON-ET (NAND)", term_zh: "与非门", term_en: "NAND gate" },
          { term_fr: "Porte NON-OU (NOR)", term_zh: "或非门", term_en: "NOR gate" },
          { term_fr: "Porte OU exclusif (XOR)", term_zh: "异或门", term_en: "XOR gate" },
          { term_fr: "Porte NON-OU exclusif (XNOR)", term_zh: "同或门", term_en: "XNOR gate" }
        ]
      },
      {
        name: "半导体与微电子元器件 (Semi-conducteurs et Composants micro-électroniques)",
        words: [
          { term_fr: "Micro-électronique", term_zh: "微电子学", term_en: "Microelectronics" },
          { term_fr: "Circuit intégré (CI)", term_zh: "集成电路", term_en: "Integrated Circuit (IC)" },
          { term_fr: "Puce", term_zh: "芯片", term_en: "Chip" },
          { term_fr: "Semi-conducteur", term_zh: "半导体", term_en: "Semiconductor" },
          { term_fr: "Silicium", term_zh: "硅", term_en: "Silicon" },
          { term_fr: "Dopage", term_zh: "掺杂", term_en: "Doping" },
          { term_fr: "Transistor", term_zh: "晶体管", term_en: "Transistor" },
          { term_fr: "Transistor bipolaire", term_zh: "双极型晶体管 (BJT)", term_en: "Bipolar Junction Transistor (BJT)" },
          { term_fr: "Transistor à effet de champ (TEC/FET)", term_zh: "场效应晶体管", term_en: "Field Effect Transistor (FET)" },
          { term_fr: "Transistor MOS", term_zh: "金属氧化物半导体晶体管", term_en: "Metal-Oxide-Semiconductor Field-Effect Transistor (MOSFET)" },
          { term_fr: "CMOS (MOS Complémentaires)", term_zh: "互补金属氧化物半导体", term_en: "Complementary Metal-Oxide-Semiconductor (CMOS)" },
          { term_fr: "TTL (Logique Transistor-Transistor)", term_zh: "晶体管-晶体管逻辑", term_en: "Transistor-Transistor Logic (TTL)" },
          { term_fr: "ECL (Logique à couplage d'émetteur)", term_zh: "发射极耦合逻辑", term_en: "Emitter-Coupled Logic (ECL)" },
          { term_fr: "Substrat", term_zh: "衬底 / 基底", term_en: "Substrate" },
          { term_fr: "Diode", term_zh: "二极管", term_en: "Diode" },
          { term_fr: "Résistance", term_zh: "电阻", term_en: "Resistor" },
          { term_fr: "Condensateur", term_zh: "电容", term_en: "Capacitor" }
        ]
      },
      {
        name: "组合逻辑电路 (Circuits combinatoires)",
        words: [
          { term_fr: "Circuit combinatoire", term_zh: "组合逻辑电路", term_en: "Combinational circuit" },
          { term_fr: "Multiplexeur (MUX)", term_zh: "多路复用器 / 数据选择器", term_en: "Multiplexer (MUX)" },
          { term_fr: "Démultiplexeur (DEMUX)", term_zh: "多路解算器 / 数据分配器", term_en: "Demultiplexer (DEMUX)" },
          { term_fr: "Décodeur", term_zh: "译码器 / 解码器", term_en: "Decoder" },
          { term_fr: "Encodeur", term_zh: "编码器", term_en: "Encoder" },
          { term_fr: "Additionneur", term_zh: "加法器", term_en: "Adder" },
          { term_fr: "Demi-additionneur", term_zh: "半加器", term_en: "Half adder" },
          { term_fr: "Comparateur", term_zh: "比较器", term_en: "Comparator" },
          { term_fr: "Convertisseur de code", term_zh: "代码转换器", term_en: "Code converter" },
          { term_fr: "Unité arithmétique et logique (UAL)", term_zh: "算术逻辑单元 (ALU)", term_en: "Arithmetic Logic Unit (ALU)" }
        ]
      },
      {
        name: "时序逻辑电路 (Circuits séquentiels)",
        words: [
          { term_fr: "Circuit séquentiel", term_zh: "时序逻辑电路", term_en: "Sequential circuit" },
          { term_fr: "Bascule", term_zh: "触发器 / 锁存器 (Flip-flop / Latch)", term_en: "Flip-flop / Latch" },
          { term_fr: "Bascule R-S", term_zh: "RS触发器", term_en: "SR Flip-flop" },
          { term_fr: "Bascule D", term_zh: "D触发器", term_en: "D Flip-flop" },
          { term_fr: "Bascule J-K", term_zh: "JK触发器", term_en: "JK Flip-flop" },
          { term_fr: "Bascule T", term_zh: "T触发器", term_en: "T Flip-flop" },
          { term_fr: "Horloge (Signal d'horloge)", term_zh: "时钟 (时钟信号)", term_en: "Clock (Clock signal)" },
          { term_fr: "Front montant", term_zh: "上升沿", term_en: "Rising edge" },
          { term_fr: "Front descendant", term_zh: "下降沿", term_en: "Falling edge" },
          { term_fr: "Registre", term_zh: "寄存器", term_en: "Register" },
          { term_fr: "Registre à décalage", term_zh: "移位寄存器", term_en: "Shift register" },
          { term_fr: "Compteur", term_zh: "计数器", term_en: "Counter" },
          { term_fr: "Compteur synchrone", term_zh: "同步计数器", term_en: "Synchronous counter" },
          { term_fr: "Compteur asynchrone", term_zh: "异步计数器", term_en: "Asynchronous counter" },
          { term_fr: "Diviseur de fréquence", term_zh: "分频器", term_en: "Frequency divider" },
          { term_fr: "Automate à états finis", term_zh: "有限状态机 (FSM)", term_en: "Finite State Machine (FSM)" }
        ]
      },
      {
        name: "存储器与总线 (Mémoires et Bus)",
        words: [
          { term_fr: "Mémoire", term_zh: "存储器", term_en: "Memory" },
          { term_fr: "Mémoire à accès aléatoire (RAM)", term_zh: "随机存取存储器", term_en: "Random Access Memory (RAM)" },
          { term_fr: "Mémoire morte (ROM)", term_zh: "只读存储器", term_en: "Read-Only Memory (ROM)" },
          { term_fr: "PROM", term_zh: "可编程只读存储器", term_en: "Programmable Read-Only Memory (PROM)" },
          { term_fr: "EPROM", term_zh: "可擦除可编程只读存储器", term_en: "Erasable Programmable Read-Only Memory (EPROM)" },
          { term_fr: "EEPROM", term_zh: "电可擦除可编程只读存储器", term_en: "Electrically Erasable Programmable Read-Only Memory (EEPROM)" },
          { term_fr: "Mémoire flash", term_zh: "闪存", term_en: "Flash memory" },
          { term_fr: "Cellule de mémoire", term_zh: "存储单元", term_en: "Memory cell / Storage cell" },
          { term_fr: "Adresse", term_zh: "地址", term_en: "Address" },
          { term_fr: "Bus de données", term_zh: "数据总线", term_en: "Data bus" },
          { term_fr: "Bus d'adresse", term_zh: "地址总线", term_en: "Address bus" }
        ]
      },
      {
        name: "电路参数与设计 (Paramètres de circuit et Conception)",
        words: [
          { term_fr: "Temps de propagation", term_zh: "传播延迟时间", term_en: "Propagation delay time" },
          { term_fr: "Fréquence d'horloge", term_zh: "时钟频率", term_en: "Clock frequency" },
          { term_fr: "Consommation d'énergie", term_zh: "功耗", term_en: "Power consumption" },
          { term_fr: "Marge de bruit", term_zh: "噪声容限", term_en: "Noise margin" },
          { term_fr: "Entrance (Fan-in)", term_zh: "扇入 / 扇入系数", term_en: "Fan-in" },
          { term_fr: "Sortance (Fan-out)", term_zh: "扇出 / 扇出系数", term_en: "Fan-out" },
          { term_fr: "Impédance", term_zh: "阻抗", term_en: "Impedance" },
          { term_fr: "Tension d'alimentation", term_zh: "电源电压", term_en: "Supply voltage" },
          { term_fr: "Dissipation de puissance", term_zh: "功率损耗", term_en: "Power dissipation" },
          { term_fr: "Boîtier", term_zh: "封装", term_en: "Package" },
          { term_fr: "Schéma électrique", term_zh: "电路图 / 原理图", term_en: "Schematic / Circuit diagram" },
          { term_fr: "Routage", term_zh: "布线", term_en: "Routing" },
          { term_fr: "Conception assistée par ordinateur (CAO)", term_zh: "计算机辅助设计 (CAD)", term_en: "Computer-Aided Design (CAD)" },
          { term_fr: "Simulation", term_zh: "仿真", term_en: "Simulation" }
        ]
      },
      {
        name: "模拟/数字系统与应用 (Systèmes analogiques/numériques et Applications)",
        words: [
          { term_fr: "Microprocesseur", term_zh: "微处理器", term_en: "Microprocessor" },
          { term_fr: "Microcontrôleur", term_zh: "微控制器 / 单片机", term_en: "Microcontroller" },
          { term_fr: "Architecture", term_zh: "架构 / 体系结构", term_en: "Architecture" },
          { term_fr: "Signal analogique", term_zh: "模拟信号", term_en: "Analog signal" },
          { term_fr: "Signal numérique", term_zh: "数字信号", term_en: "Digital signal" },
          { term_fr: "Convertisseur analogique-numérique (CAN)", term_zh: "模数转换器 (ADC)", term_en: "Analog-to-Digital Converter (ADC)" },
          { term_fr: "Convertisseur numérique-analogique (CNA)", term_zh: "数模转换器 (DAC)", term_en: "Digital-to-Analog Converter (DAC)" },
          { term_fr: "Système embarqué", term_zh: "嵌入式系统", term_en: "Embedded system" },
          { term_fr: "Temps réel", term_zh: "实时", term_en: "Real-time" },
          { term_fr: "Bande passante", term_zh: "带宽", term_en: "Bandwidth" },
          { term_fr: "Fiabilité", term_zh: "可靠性", term_en: "Reliability" },
          { term_fr: "Redondance", term_zh: "冗余", term_en: "Redundancy" },
          { term_fr: "Onde", term_zh: "波形 / 信号波", term_en: "Waveform / Wave" },
          { term_fr: "Impulsion", term_zh: "脉冲", term_en: "Pulse" }
        ]
      }
    ]
  },
  ...extraGlossaryBooks,
  ...moreGlossaryBooks
];
