# 合成大珍猪 · GitHub Pages 版

13 级图片、14 段随机合成音效、独立循环 BGM、昵称、最高分、共享排行接口、破纪录图片球庆祝。
游戏名称暂定，修改 config.js 的 title 即可。

## 一、先发布游戏（不配置数据库也能玩）

1. 解压下载的 zip。不要直接上传 zip。
2. 登录 https://github.com ，右上角 + → New repository。
3. Repository name 输入 merge-game，选 Public，然后 Create repository。
4. 在仓库选择 Add file → Upload files（空仓库也可以点 uploading an existing file）。
5. 把解压文件夹里面的文件和 assets 文件夹拖进上传区域。不要把外层 merge-game 文件夹整个拖进去。
6. Commit changes。确认仓库最外层直接有 index.html、game.js、config.js、cloud.js、style.css 和 assets 文件夹。
7. Settings → Pages → Build and deployment。
8. Source 选 Deploy from a branch；Branch 选 main；目录选 / (root)；Save。
9. 等待部署完成，Pages 页面点 Visit site。一般地址是 https://你的用户名.github.io/merge-game/ 。
10. 可以先自己试玩。这时显示“本地模式”，最高分只保存在当前浏览器；共享排行榜尚未启用。

文件采用相对路径，兼容 GitHub Pages 仓库子目录。没有构建步骤，也不需要安装 Node。
不要双击 index.html 当作正式测试：file:// 模式下音频 fetch 可能被浏览器阻止。

## 二、开启大家共享的排行榜

使用 https://supabase.com 创建自己的项目。服务套餐和额度以官网显示为准，不保证永久免费或永久在线。

1. 创建项目。数据库密码自行保管，不要填到游戏代码里。
2. 打开 SQL Editor → New query，把本包 supabase.sql 的全部内容粘贴进去，点 Run。
3. 在 Authentication 的登录配置中启用 Allow anonymous sign-ins。不同版本控制台可能在 Sign In / Providers 或 General configuration 下。
4. 在项目连接面板 / Project Settings 找到 Project URL 和 Publishable key。legacy anon public key 也兼容。
5. 编辑 config.js，只填下面两项，保留引号：

```javascript
supabaseUrl: 'https://你的项目编号.supabase.co',
supabaseKey: '你的 publishable key 或 anon public key',
```

**绝对不要使用 secret key、service_role key 或数据库密码。** 本包 SQL 收紧了表权限，只允许经过认证的用户通过函数更新自己的昵称和最高分。

6. 把修改后的 config.js 重新上传到同一 GitHub 仓库，覆盖并提交。
7. 等 GitHub Pages 发布更新，刷新游戏，输入昵称。状态应变为“云端已连接”。
8. 打开另一个浏览器或另一台设备，起不同昵称，分别完成一局。检查排行榜显示两人的成绩、各自名次；刷新后最高分仍在。
9. 共享排行取前 100 名，同时单独显示自己的真实名次；同分并列，后续名次按比赛排名跳号。

如果页面一直是“本地模式”，检查 config.js 两个字段是否已填写、是否已发布更新。
如果提示“请先开启匿名登录”，检查 Supabase 匿名登录开关。
如果提示函数不存在，重新运行完整 supabase.sql。
如果提示网络错误，检查 Project URL、key、项目是否暂停、当前网络是否能连接该项目。

## 三、图片顺序

assets/images/01.jpg 到 13.jpg，按发送顺序排列。最新上传的单张照片是 13.jpg，最大等级；上一轮图二是 12.jpg。
image-order.json 记录原始文件名对应顺序。
图片使用原始素材；游戏通过 Canvas 居中裁成圆形展示。可以替换同名文件更新图片。

## 四、声音

- 原始 BGM 约 195.5 秒，独立 Web Audio 音源循环播放。
- 66.3 秒音效合集依据至少 0.8 秒、低于 -38 dB 的静音分割为 14 段。
- 每段前后保留少量余量，统一响度，添加极短淡入淡出避免切口爆音。
- audio-segments.json 记录每段源音频起止时间，便于调整。
- 每次合成独立随机选一段；可以重复抽中同一段。连续合成允许音效重叠，不截断前一段，也不暂停、重启或压低 BGM。
- 音乐默认增益 0.12，合成和庆祝音效 0.95，可在右上角声音设置调节。
- 首次点击“开始玩”后播放，这是浏览器的声音启动机制。切到后台、锁屏或来电时，手机系统仍可能暂停网页声音；游戏操作本身不干扰音乐。

## 五、游戏规则

左右拖动，松手投下；电脑支持鼠标或方向键 + 空格。出生球随机选前 4 级。
同级碰撞合成下一级；每次得分 = 被合并的等级 × 10。
两颗 13 级球相碰会一起消除并加 130 分，留出空间继续游戏。
球体落稳后持续越过警戒线约 2 秒结束。可以无限次再开新局。
点击“重新开始”先确认并结算当前局，不会直接丢掉成绩。

每局结束：超过开局时个人最高分，或云端排名优于开局时排名，打开图片球庆祝页面。第一次入榜没有旧排名，不会虚构排名提升。系统启用“减少动态效果”时关闭滚动和标题动画，庆祝音频仍会播放。

## 六、身份与保存范围

昵称不是密码。云端采用匿名登录生成独立玩家身份，登录令牌保存在浏览器中；同名玩家不会互相覆盖。
清理浏览器数据、使用隐私窗口或换设备会产生新身份。没有跨设备恢复功能。
本地最高分每次提升就保存；云端成绩在结算时上传。刷新会丢失尚未结束的棋盘；不会自动把未结算成绩提交云端。
同步失败时会保留待上传最高分，可在结算页点“重试同步成绩”，或下一局结算时一起上传。

这是一套朋友间的休闲排行：服务器限制只能更新自己的记录、最高分不能降低，但成绩来自浏览器，不能防止玩家通过开发者工具伪造成绩。没有宣称具备正式比赛级反作弊。

## 七、验证情况与发布前检查

已完成：JavaScript 语法检查；物理与计分逻辑测试；浏览器启动、昵称输入、投放和页面视觉检查；音频片段时长和素材文件检查。
尚需你配置项目后验证：真实匿名登录、跨设备共享排行、成绩同步、排名上升庆祝。未在真实 iPhone 上试听，也未作云端部署验证。
建议发布前用自己的手机试听音乐和音效比例，再用另一浏览器完成上面的双玩家测试。

官方参考：
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/quickstart
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/database/functions

## 灰白淡粉更新版

主标题“合成大珍猪”使用加粗斜体书法字体栈、描边、立体阴影和浮动动效。字体随设备可用的中文字体略有不同。
首次合成第 13 级会立即暂停棋盘，打开“恭喜你合成大珍猪！！”庆祝页面；关闭后继续本局。破个人纪录、排名提升在结算时也会打开庆祝页面，标题说明真实原因。
新增 assets/audio/celebration.mp3，约 14.7 秒，庆祝页面打开期间循环播放；点击“收下快乐，继续”或按 Esc 关闭后停止。背景音乐始终独立播放，不因庆祝启停而重启或降低音量。
动画球持续弹跳滚动，直到关闭庆祝页。未达成最终等级不会显示“合成大珍猪”的成功提示。
